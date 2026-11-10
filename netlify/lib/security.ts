import { env } from "./env";
import { getSupabase } from "./supabase";

/**
 * Utilidades anti-abuso: honeypot, rate limiting por IP y Cloudflare Turnstile.
 *
 * Nunca se guarda la IP: se guarda un hash HMAC (ver `hashValue` en auth.ts).
 */

/** Nombre del campo trampa. Debe coincidir con el de los formularios. */
export const HONEYPOT_FIELD = "website";

/**
 * Un bot rellena todos los campos que encuentra, incluido el oculto.
 * Si viene con contenido, el envío se descarta sin avisar.
 */
export function isHoneypotFilled(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
};

function isMissingRpc(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return (
    code === "PGRST202" ||
    code === "42883" ||
    code === "PGRST205" ||
    code === "42P01"
  );
}

function normalizeRateLimit(data: unknown, max: number): RateLimitResult {
  const row = (data || {}) as {
    allowed?: boolean;
    remaining?: number;
    retry_after?: number;
  };
  return {
    allowed: row.allowed !== false,
    remaining: Math.max(0, Number(row.remaining ?? max)),
    retryAfter: Math.max(0, Number(row.retry_after ?? 0))
  };
}

/**
 * Ventana deslizante en Postgres.
 * Una sola llamada comprueba el cupo e inserta la marca de tiempo. La limpieza
 * de registros viejos la hace pg_cron; si no está activo, el plan B la hace
 * de forma oportunista.
 */
export async function rateLimit(
  bucket: string,
  ipHash: string,
  max: number,
  windowSeconds = 60
): Promise<RateLimitResult> {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc("consumir_rate_limit", {
      p_bucket: bucket,
      p_ip_hash: ipHash,
      p_max: max,
      p_window_seconds: windowSeconds
    });

    if (!error) return normalizeRateLimit(data, max);

    // Si la migración nueva aún no está, se usa el método anterior.
    if (!isMissingRpc(error)) {
      console.error("[rate-limit]", error.message);
      return { allowed: true, remaining: max, retryAfter: 0 };
    }

    const since = new Date(Date.now() - windowSeconds * 1000).toISOString();

    const { count, error: countError } = await supabase
      .from("rate_limits")
      .select("id", { count: "exact", head: true })
      .eq("bucket", bucket)
      .eq("ip_hash", ipHash)
      .gte("created_at", since);

    if (countError) {
      // Si la tabla todavía no existe no se bloquea la tienda.
      console.error("[rate-limit]", countError.message);
      return { allowed: true, remaining: max, retryAfter: 0 };
    }

    if ((count || 0) >= max) {
      return { allowed: false, remaining: 0, retryAfter: windowSeconds };
    }

    await supabase.from("rate_limits").insert({ bucket, ip_hash: ipHash });

    if (Math.random() < 0.05) {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      await supabase.from("rate_limits").delete().lt("created_at", cutoff);
    }

    return {
      allowed: true,
      remaining: Math.max(0, max - (count || 0) - 1),
      retryAfter: 0
    };
  } catch (error) {
    console.error("[rate-limit]", error);
    return { allowed: true, remaining: max, retryAfter: 0 };
  }
}

const TURNSTILE_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Turnstile es opcional: si no hay secreto configurado no se exige captcha,
 * así el proyecto sigue funcionando antes de crear la cuenta en Cloudflare.
 */
export function turnstileEnabled(): boolean {
  return Boolean(env.TURNSTILE_SECRET_KEY);
}

export async function verifyTurnstile(
  token: string | null | undefined,
  ip: string
): Promise<boolean> {
  if (!turnstileEnabled()) return true;

  const value = String(token || "").trim();
  if (!value) return false;

  const body = new URLSearchParams({
    secret: env.TURNSTILE_SECRET_KEY,
    response: value
  });
  if (ip && ip !== "unknown") body.set("remoteip", ip);

  try {
    const response = await fetch(TURNSTILE_URL, {
      method: "POST",
      body,
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return false;

    const data = (await response.json()) as { success?: boolean };
    return data.success === true;
  } catch (error) {
    console.error("[turnstile]", error);
    return false;
  }
}
