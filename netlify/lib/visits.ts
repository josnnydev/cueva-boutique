import type { z } from "zod";
import { AppError } from "./errors";
import { env } from "./env";
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

export const REFERRER_LABELS: Record<ReferrerKey, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  whatsapp: "WhatsApp",
  google: "Google",
  directo: "Directo",
  otros: "Otros"
};

const DAY_MS = 24 * 60 * 60 * 1000;
const TIME_ZONE = "America/Santo_Domingo";
const PAGE_SIZE = 1000;
const MAX_PAGES = 60;
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

function normalizeHost(value: string): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^www\./, "")
    .replace(/:\d+$/, "");
}

export function categorizeReferrer(
  referrer: string | null | undefined,
  siteHost = ""
): ReferrerKey {
  const raw = String(referrer || "").trim();
  if (!raw) return "directo";

  let host = "";
  try {
    host = normalizeHost(new URL(raw).hostname);
  } catch {
    host = normalizeHost(raw.replace(/^[a-z-]+:\/\//i, "").split("/")[0] || "");
  }
  if (!host) return "directo";

  const ownHost = normalizeHost(siteHost);
  if (ownHost && (host === ownHost || host.endsWith(`.${ownHost}`))) {
    return "directo";
  }

  if (
    host === "instagram.com" ||
    host.endsWith(".instagram.com") ||
    host === "ig.me" ||
    host.endsWith(".ig.me")
  ) {
    return "instagram";
  }

  if (
    host === "facebook.com" ||
    host.endsWith(".facebook.com") ||
    host === "fb.com" ||
    host.endsWith(".fb.com") ||
    host === "fb.me" ||
    host.endsWith(".fb.me")
  ) {
    return "facebook";
  }

  if (
    host === "whatsapp.com" ||
    host.endsWith(".whatsapp.com") ||
    host === "wa.me" ||
    host.endsWith(".wa.me") ||
    host === "com.whatsapp"
  ) {
    return "whatsapp";
  }

  if (
    /^(?:www\.)?google(?:\.[a-z]{2,})+$/.test(host) ||
    host === "g.co" ||
    host.endsWith(".g.co") ||
    host === "goo.gl" ||
    host === "googleusercontent.com" ||
    host.endsWith(".googleusercontent.com") ||
    host.endsWith(".googleadservices.com") ||
    host.endsWith(".googlesyndication.com")
  ) {
    return "google";
  }

  return "otros";
}

function visitsUnavailable(error: unknown): never {
  const code = (error as { code?: string } | null)?.code;
  if (code === "42P01" || code === "PGRST205") {
    throw new AppError(
      503,
      "VISITS_NOT_READY",
      "Falta crear la tabla de visitas en Supabase. Ejecuta la migración SQL de estadísticas."
    );
  }
  throw error;
}

export async function recordVisit(
  input: VisitInput,
  userAgent: string
): Promise<boolean> {
  const agent = String(userAgent || "").slice(0, 500) || null;
  if (isBotUserAgent(agent)) return false;

  const supabase = getSupabase();
  const since = new Date(Date.now() - DEDUPE_SECONDS * 1000).toISOString();

  // Evita duplicados del mismo navegador al cambiar de ancla o recargar.
  const { data: recent, error: readError } = await supabase
    .from("visitas")
    .select("id")
    .eq("session_id", input.sessionId)
    .eq("pagina", input.pagina)
    .gte("created_at", since)
    .limit(1);

  if (readError) visitsUnavailable(readError);
  if (recent && recent.length > 0) return false;

  const { error } = await supabase.from("visitas").insert({
    pagina: input.pagina,
    referrer: input.referrer ? input.referrer.slice(0, 500) : null,
    user_agent: agent,
    session_id: input.sessionId
  });

  if (error) visitsUnavailable(error);
  return true;
}

function dateKey(value: string | Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}

function labelFromKey(key: string): string {
  const [, month, day] = key.split("-");
  return `${day}/${month}`;
}

function keysFor(days: number, reference = Date.now()): string[] {
  const keys: string[] = [];
  for (let index = days - 1; index >= 0; index -= 1) {
    keys.push(dateKey(new Date(reference - index * DAY_MS)));
  }
  return keys;
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
      .select("name,slug,legacy_anchor");
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

async function loadVisits(since: string): Promise<
  Array<{ created_at: string; pagina: string; referrer: string | null; session_id: string }>
> {
  const rows: Array<{
    created_at: string;
    pagina: string;
    referrer: string | null;
    session_id: string;
  }> = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await getSupabase()
      .from("visitas")
      .select("created_at,pagina,referrer,session_id")
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) visitsUnavailable(error);
    if (!data || data.length === 0) break;
    rows.push(...(data as typeof rows));
    if (data.length < PAGE_SIZE) break;
  }

  return rows;
}

export function buildVisitStats(
  rows: Array<{
    created_at: string;
    pagina: string;
    referrer: string | null;
    session_id: string;
  }>,
  products: Map<string, string>,
  days = 30,
  siteHost = defaultSiteHost(),
  reference = Date.now()
): VisitStats {
  const windowDays = days === 7 ? 7 : 30;
  const keys30 = keysFor(30, reference);
  const keys7 = keysFor(7, reference);
  const windowKeys = keysFor(windowDays, reference);
  const keySet30 = new Set(keys30);
  const keySet7 = new Set(keys7);
  const windowSet = new Set(windowKeys);
  const todayKey = keys30[keys30.length - 1];

  const dailyIndex = new Map<string, number>();
  const daily = windowKeys.map((key, index) => {
    dailyIndex.set(key, index);
    return {
      date: key,
      label: labelFromKey(key),
      visits: 0,
      unique: 0
    };
  });

  const sessionsByDay = new Map<string, Set<string>>();
  const sessionsToday = new Set<string>();
  const sessions7 = new Set<string>();
  const sessions30 = new Set<string>();
  const pageCounts = new Map<string, number>();
  const referrerCounts = new Map<ReferrerKey, number>();

  let today = 0;
  let last7 = 0;
  let last30 = 0;
  let windowTotal = 0;

  for (const row of rows) {
    const key = dateKey(row.created_at);
    if (!keySet30.has(key)) continue;

    const session = String(row.session_id || "");

    if (key === todayKey) {
      today += 1;
      sessionsToday.add(session);
    }
    if (keySet7.has(key)) {
      last7 += 1;
      sessions7.add(session);
    }
    last30 += 1;
    sessions30.add(session);

    if (!windowSet.has(key)) continue;

    windowTotal += 1;
    const index = dailyIndex.get(key);
    if (index !== undefined) daily[index].visits += 1;
    if (!sessionsByDay.has(key)) sessionsByDay.set(key, new Set());
    sessionsByDay.get(key)?.add(session);

    const page = String(row.pagina || "/");
    pageCounts.set(page, (pageCounts.get(page) || 0) + 1);

    const referrer = categorizeReferrer(row.referrer, siteHost);
    referrerCounts.set(referrer, (referrerCounts.get(referrer) || 0) + 1);
  }

  for (const item of daily) {
    item.unique = sessionsByDay.get(item.date)?.size || 0;
  }

  const topPages = Array.from(pageCounts.entries())
    .map(([page, visits]) => ({
      page,
      label: pageLabel(page, products),
      visits
    }))
    .sort((a, b) => b.visits - a.visits || a.label.localeCompare(b.label))
    .slice(0, 10);

  const order: ReferrerKey[] = [
    "instagram",
    "facebook",
    "whatsapp",
    "google",
    "directo",
    "otros"
  ];
  const referrers = order
    .map((key) => {
      const visits = referrerCounts.get(key) || 0;
      return {
        key,
        label: REFERRER_LABELS[key],
        visits,
        share: windowTotal ? Math.round((visits / windowTotal) * 1000) / 10 : 0
      };
    })
    .filter((item) => item.visits > 0)
    .sort((a, b) => b.visits - a.visits);

  return {
    days: windowDays,
    totals: {
      today,
      last7,
      last30,
      uniqueToday: sessionsToday.size,
      unique7: sessions7.size,
      unique30: sessions30.size
    },
    daily,
    topPages,
    referrers,
    windowTotal,
    generatedAt: new Date(reference).toISOString()
  };
}

export async function getVisitStats(
  days = 30,
  siteHost = defaultSiteHost()
): Promise<VisitStats> {
  const since = new Date(Date.now() - 32 * DAY_MS).toISOString();
  const [rows, products] = await Promise.all([loadVisits(since), loadProducts()]);
  return buildVisitStats(rows, products, days, siteHost);
}
