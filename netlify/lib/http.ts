import type { HandlerEvent } from "@netlify/functions";
import { env } from "./env";

export type JsonResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

export function json(
  statusCode: number,
  payload: unknown,
  extraHeaders: Record<string, string> = {}
): JsonResponse {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...extraHeaders
    },
    body: JSON.stringify(payload)
  };
}

export function ok(data: unknown, extraHeaders: Record<string, string> = {}): JsonResponse {
  return json(200, { ok: true, data, error: null }, extraHeaders);
}

export function fail(
  statusCode: number,
  code: string,
  message: string,
  details?: unknown,
  extraHeaders: Record<string, string> = {}
): JsonResponse {
  return json(
    statusCode,
    {
      ok: false,
      data: null,
      error: { code, message, details: details ?? null }
    },
    extraHeaders
  );
}

export function getHeader(event: HandlerEvent, name: string): string {
  const lower = name.toLowerCase();
  const direct = event.headers[lower];
  if (direct) return direct;
  for (const key of Object.keys(event.headers)) {
    if (key.toLowerCase() === lower) return event.headers[key] || "";
  }
  return "";
}

export function parseBody(event: HandlerEvent): unknown {
  if (!event.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

export function requestIp(event: HandlerEvent): string {
  return (
    getHeader(event, "x-nf-client-connection-ip") ||
    getHeader(event, "x-forwarded-for").split(",")[0]?.trim() ||
    "unknown"
  );
}

export function corsHeaders(event: HandlerEvent): Record<string, string> {
  const origin = getHeader(event, "origin");
  if (!origin) return {};

  const allowed =
    origin === env.ALLOWED_ORIGIN ||
    /^http:\/\/localhost:\d+$/.test(origin) ||
    /^http:\/\/127\.0\.0\.1:\d+$/.test(origin);

  if (!allowed) return {};

  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-CB-Request",
    Vary: "Origin"
  };
}

export function isMutation(method: string): boolean {
  return ["POST", "PATCH", "PUT", "DELETE"].includes(method.toUpperCase());
}

export function sameOrigin(event: HandlerEvent): boolean {
  const origin = getHeader(event, "origin");
  if (!origin) return true; // Same-origin fetch puede no enviar Origin en GET.
  if (env.ALLOWED_ORIGIN && origin === env.ALLOWED_ORIGIN.replace(/\/+$/, "")) return true;
  if (/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) return true;

  // Dominios propios, alias de Netlify y deploy previews: el Origin debe
  // coincidir con el host real de la petición.
  try {
    const originHost = new URL(origin).host;
    const requestHost =
      getHeader(event, "x-forwarded-host") || getHeader(event, "host");
    if (requestHost && originHost === requestHost.split(",")[0].trim()) return true;
  } catch {
    // Origin inválido.
  }

  return false;
}
