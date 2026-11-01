import crypto from "node:crypto";
import type { HandlerEvent } from "@netlify/functions";
import { env } from "./env";
import { getSupabase } from "./supabase";
import { readCookie, verifySession, COOKIE_NAME } from "./session";

export type AdminUser = {
  id: string;
  email: string;
  fullName: string | null;
  sessionVersion: number;
};

export function hashValue(value: string): string {
  return crypto
    .createHmac("sha256", env.SESSION_SECRET || "cueva-cms")
    .update(value)
    .digest("hex");
}

export function emailHash(email: string): string {
  return hashValue(email.trim().toLowerCase());
}

export async function getAdmin(event: HandlerEvent): Promise<AdminUser | null> {
  const token = readCookie(event, COOKIE_NAME);
  const session = verifySession(token);
  if (!session) return null;

  const { data, error } = await getSupabase()
    .from("admin_profiles")
    .select("user_id, email, full_name, is_active, session_version")
    .eq("user_id", session.sub)
    .maybeSingle();

  if (error || !data || !data.is_active) return null;
  if (Number(data.session_version) !== Number(session.sv)) return null;

  return {
    id: data.user_id,
    email: data.email,
    fullName: data.full_name,
    sessionVersion: Number(data.session_version)
  };
}

export async function tooManyAttempts(email: string, ipHash: string): Promise<boolean> {
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { count, error } = await getSupabase()
    .from("login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("email_hash", emailHash(email))
    .eq("ip_hash", ipHash)
    .eq("success", false)
    .gte("created_at", since);

  if (error) return false;
  return (count || 0) >= 5;
}

export async function recordAttempt(
  email: string,
  ipHash: string,
  success: boolean
): Promise<void> {
  const supabase = getSupabase();

  await supabase.from("login_attempts").insert({
    email_hash: emailHash(email),
    ip_hash: ipHash,
    success
  });

  // Limpieza oportunista para no crecer sin control en el plan gratuito.
  if (success && Math.random() < 0.1) {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    await supabase.from("login_attempts").delete().lt("created_at", cutoff);
  }
}

export async function audit(input: {
  actor: AdminUser | null;
  action: string;
  entity: string;
  entityId?: string | null;
  diff?: unknown;
  ipHash?: string;
}): Promise<void> {
  try {
    await getSupabase().from("audit_log").insert({
      actor_id: input.actor?.id || null,
      actor_email: input.actor?.email || null,
      action: input.action,
      entity: input.entity,
      entity_id: input.entityId || null,
      diff: input.diff ?? null,
      ip_hash: input.ipHash || null
    });
  } catch {
    // La auditoría nunca debe tumbar la operación principal.
  }
}
