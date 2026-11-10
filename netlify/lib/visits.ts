import type { z } from "zod";
import { AppError } from "./errors";
import { env } from "./env";
import { rateLimit } from "./security";
import { getSupabase } from "./supabase";
import type { visitSchema } from "./validation";

type VisitInput = z.infer<typeof visitSchema>;

export type ReferrerKey =
  | "instagram"
  | "facebook"
  | "whatsapp"
  | "google"
  | "directo"
  | "otros";

export type VisitStats = {
  days: number;
  totals: {
    today: number;
    last7: number;
    last30: number;
    uniqueToday: number;
    unique7: number;
    unique30: number;
  };
  daily: Array<{ date: string; label: string; visits: number; unique: number }>;
  topPages: Array<{ page: string; label: string; visits: number }>;
  referrers: Array<{
    key: ReferrerKey;
    label: string;
    visits: number;
    share: number;
  }>;
  windowTotal: number;
  generatedAt: string;
};

export type VisitRecordResult = {
  recorded: boolean;
  reason: "ok" | "duplicate" | "rate" | "invalid";
};

export const REFERRER_LABELS: Record<ReferrerKey, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  whatsapp: "WhatsApp",
  google: "Google",
  directo: "Directo",
  otros: "Otros"
};

const DEDUPE_SECONDS = 90;

// Bots, crawlers y generadores de vistas previas. Se ignoran antes de escribir.
const BOT_RE =
  /\b(?:bot|crawler|spider|slurp)\b|googlebot|bingbot|bingpreview|yandexbot|duckduckbot|baiduspider|sogou|exabot|semrushbot|ahrefsbot|mj12bot|dotbot|petalbot|bytespider|gptbot|chatgpt-user|claude-web|anthropic-ai|ccbot|perplexitybot|amazonbot|facebookexternalhit|facebookcatalog|meta-externalagent|telegrambot|discordbot|linkedinbot|twitterbot|pinterestbot|applebot|google-inspectiontool|googleother|google-read-aloud|mediapartners-google|adsbot-google|apis-google|feedfetcher|headlesschrome|phantomjs|puppeteer|playwright|lighthouse|pagespeed|gtmetrix|curl\/|wget\/|python-requests|python-urllib|aiohttp|httpx\/|axios\/|node-fetch|undici|go-http-client|java\/|okhttp|apache-httpclient|libwww-perl|postmanruntime|insomnia/i;

export function isBotUserAgent(userAgent: string | null | undefined): boolean {
  const value = String(userAgent || "").trim();
  if (!value) return false;
  return BOT_RE.test(value);
}

function defaultSiteHost(): string {
  try {
    return new URL(env.ALLOWED_ORIGIN || "").hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isMissingRpc(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return (
    code === "PGRST202" ||
    code === "42883" ||
    code === "PGRST205" ||
    code === "42P01"
  );
}

function visitsUnavailable(error: unknown): never {
  if (isMissingRpc(error)) {
    throw new AppError(
      503,
      "VISITS_NOT_READY",
      "Falta ejecutar la migración de rendimiento en Supabase (visitas_stats)."
    );
  }
  throw error;
}

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeReferrerKey(value: unknown): ReferrerKey {
  return value === "instagram" ||
    value === "facebook" ||
    value === "whatsapp" ||
    value === "google" ||
    value === "directo" ||
    value === "otros"
    ? value
    : "otros";
}

/**
 * Registro rápido: una sola llamada a Postgres hace cupo por IP, deduplicación
 * e inserción. Si la migración nueva todavía no existe, usa el método anterior.
 */
export async function recordVisit(
  input: VisitInput,
  userAgent: string,
  ipHash: string,
  maxPerMinute = 30
): Promise<VisitRecordResult> {
  const agent = String(userAgent || "").slice(0, 500) || null;
  if (isBotUserAgent(agent)) return { recorded: false, reason: "invalid" };

  const supabase = getSupabase();
  const { data, error } = await supabase.rpc("registrar_visita", {
    p_pagina: input.pagina,
    p_referrer: input.referrer ?? null,
    p_user_agent: agent,
    p_session_id: input.sessionId,
    p_ip_hash: ipHash,
    p_max_por_minuto: maxPerMinute
  });

  if (!error) {
    const row = (data || {}) as { recorded?: boolean; reason?: string };
    const reason = row.reason;
    return {
      recorded: Boolean(row.recorded),
      reason:
        reason === "duplicate" || reason === "rate" || reason === "invalid"
          ? reason
          : row.recorded
            ? "ok"
            : "duplicate"
    };
  }

  if (!isMissingRpc(error)) visitsUnavailable(error);

  // Plan B antes de ejecutar la migración de rendimiento: mantiene el límite.
  const limit = await rateLimit("visits", ipHash, maxPerMinute);
  if (!limit.allowed) return { recorded: false, reason: "rate" };

  return recordVisitLegacy(input, agent);
}

async function recordVisitLegacy(
  input: VisitInput,
  agent: string | null
): Promise<VisitRecordResult> {
  const supabase = getSupabase();
  const since = new Date(Date.now() - DEDUPE_SECONDS * 1000).toISOString();

  const { data: recent, error: readError } = await supabase
    .from("visitas")
    .select("id")
    .eq("session_id", input.sessionId)
    .eq("pagina", input.pagina)
    .gte("created_at", since)
    .limit(1);

  if (readError) visitsUnavailable(readError);
  if (recent && recent.length > 0) {
    return { recorded: false, reason: "duplicate" };
  }

  const { error } = await supabase.from("visitas").insert({
    pagina: input.pagina,
    referrer: input.referrer ? input.referrer.slice(0, 500) : null,
    user_agent: agent,
    session_id: input.sessionId
  });

  if (error) visitsUnavailable(error);
  return { recorded: true, reason: "ok" };
}

function labelFromKey(key: string): string {
  const [, month, day] = key.split("-");
  return `${day}/${month}`;
}

function pageLabel(page: string, products: Map<string, string>): string {
  let pathname = page;
  let hash = "";

  try {
    const url = new URL(page, "https://cueva.local");
    pathname = url.pathname;
    hash = decodeURIComponent(url.hash.replace(/^#/, ""));
  } catch {
    // Se usa la ruta tal cual si no es una URL válida.
  }

  const productName = hash ? products.get(hash) : "";
  if (productName) return productName;

  if (hash && (pathname === "/" || pathname === "")) {
    return `#${hash}`;
  }
  if (pathname === "/" || pathname === "" || pathname === "/index.html") {
    return "Inicio";
  }
  return pathname;
}

async function loadProducts(): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  try {
    const { data, error } = await getSupabase()
      .from("products")
      .select("name,slug,legacy_anchor")
      .limit(500);
    if (error) return map;

    for (const product of data || []) {
      const name = String(product.name || "").trim();
      if (!name) continue;
      const slug = String(product.slug || "").trim();
      if (slug) map.set(`product-${slug}`, name);
      if (product.legacy_anchor) map.set(String(product.legacy_anchor), name);
    }
  } catch {
    // Si falla el catálogo, las páginas se muestran con su ruta.
  }
  return map;
}

export async function getVisitStats(
  days = 30,
  siteHost = defaultSiteHost()
): Promise<VisitStats> {
  const supabase = getSupabase();
  const [statsResult, products] = await Promise.all([
    supabase.rpc("visitas_stats", {
      p_days: days === 7 ? 7 : 30,
      p_site_host: siteHost
    }),
    loadProducts()
  ]);

  if (statsResult.error) visitsUnavailable(statsResult.error);

  const raw = (statsResult.data || {}) as Record<string, any>;
  const windowTotal = number(raw.windowTotal);
  const totals = (raw.totals || {}) as Record<string, unknown>;

  const daily = Array.isArray(raw.daily)
    ? raw.daily.map((item: any) => {
        const date = String(item.date || "");
        return {
          date,
          label: labelFromKey(date),
          visits: number(item.visits),
          unique: number(item.unique)
        };
      })
    : [];

  const topPages = Array.isArray(raw.topPages)
    ? raw.topPages.slice(0, 10).map((item: any) => {
        const page = String(item.page || "/");
        return {
          page,
          label: pageLabel(page, products),
          visits: number(item.visits)
        };
      })
    : [];

  const referrers = Array.isArray(raw.referrers)
    ? raw.referrers
        .map((item: any) => {
          const key = normalizeReferrerKey(item.key);
          const visits = number(item.visits);
          return {
            key,
            label: REFERRER_LABELS[key],
            visits,
            share: windowTotal
              ? Math.round((visits / windowTotal) * 1000) / 10
              : 0
          };
        })
        .filter((item: { visits: number }) => item.visits > 0)
        .sort(
          (a: { visits: number }, b: { visits: number }) => b.visits - a.visits
        )
    : [];

  return {
    days: raw.days === 7 ? 7 : 30,
    totals: {
      today: number(totals.today),
      last7: number(totals.last7),
      last30: number(totals.last30),
      uniqueToday: number(totals.uniqueToday),
      unique7: number(totals.unique7),
      unique30: number(totals.unique30)
    },
    daily,
    topPages,
    referrers,
    windowTotal,
    generatedAt: String(raw.generatedAt || new Date().toISOString())
  };
}
