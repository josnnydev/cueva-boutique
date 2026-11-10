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

/**
 * Ventana deslizante simple en Postgres.
 * Cada envío inserta una fila y se cuentan las de la ventana actual.
 */
export async function rateLimit(
  bucket: string,
  ipHash: string,
  max: number,
  windowSeconds = 60
): Promise<RateLimitResult> {
  try {
    const supabase = getSupabase();
    const since = new Date(Date.now() - windowSeconds * 1000).toISOString();

    const { count, error } = await supabase
      .from("rate_limits")
      .select("id", { count: "exact", head: true })
      .eq("bucket", bucket)
      .eq("ip_hash", ipHash)
      .gte("created_at", since);

    if (error) {
      // Si la tabla todavía no existe no se bloquea la tienda.
      console.error("[rate-limit]", error.message);
      return { allowed: true, remaining: max, retryAfter: 0 };
    }

    if ((count || 0) >= max) {
      return { allowed: false, remaining: 0, retryAfter: windowSeconds };
    }

    await supabase.from("rate_limits").insert({ bucket, ip_hash: ipHash });

    // Limpieza oportunista para no crecer sin límite en el plan gratuito.
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
