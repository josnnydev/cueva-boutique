import type { z } from "zod";
import { env } from "./env";
import { getSupabase } from "./supabase";
import { audit, type AdminUser } from "./auth";
import { AppError } from "./errors";
import { releaseSchema, settingsSchema } from "./validation";

type SettingsInput = z.infer<typeof settingsSchema>;

export async function getSettings() {
  const { data, error } = await getSupabase()
    .from("settings")
    .select("key,value,updated_at")
    .in("key", ["store", "daily_offers", "site", "build"]);

  if (error) throw error;

  const result: Record<string, any> = {};
  for (const row of data || []) {
    result[row.key] = row.value;
  }

  return {
    store: result.store || {},
    dailyOffers: result.daily_offers || {},
    site: result.site || {},
    build: result.build || {}
  };
}

export async function updateSettings(input: SettingsInput, actor: AdminUser) {
  const supabase = getSupabase();
  const current = await getSettings();

  const updates: Array<{ key: string; value: unknown }> = [];

  if (input.store) {
    updates.push({ key: "store", value: { ...current.store, ...input.store } });
  }
  if (input.dailyOffers) {
    updates.push({
      key: "daily_offers",
      value: { ...current.dailyOffers, ...input.dailyOffers }
    });
  }
  if (input.site) {
    updates.push({ key: "site", value: { ...current.site, ...input.site } });
  }

  if (!updates.length) {
    throw new AppError(422, "NOTHING_TO_UPDATE", "No hay ajustes para guardar.");
  }

  for (const update of updates) {
    const { error } = await supabase.from("settings").upsert(
      {
        key: update.key,
        value: update.value,
        updated_by: actor.id
      },
      { onConflict: "key" }
    );
    if (error) throw error;
  }

  await audit({
    actor,
    action: "settings.update",
    entity: "settings",
    entityId: "global",
    diff: { before: current, after: input }
  });

  return getSettings();
}

export async function listReleases() {
  const { data, error } = await getSupabase()
    .from("site_releases")
    .select("*")
    .order("released_at", { ascending: false })
    .limit(20);

  if (error) throw error;
  return data || [];
}

export async function triggerBuild(
  actor: AdminUser,
  options: { force?: boolean } = {}
) {
  const supabase = getSupabase();
  const { data: buildRow } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "build")
    .maybeSingle();

  const build = (buildRow?.value || {}) as Record<string, unknown>;
  const last = build.lastTriggeredAt ? new Date(String(build.lastTriggeredAt)).getTime() : 0;
  const minimum = 10 * 60 * 1000;

  if (!options.force && last && Date.now() - last < minimum) {
    return {
      triggered: false,
      reason: "Ya se generó un build hace menos de 10 minutos. Puedes forzarlo desde Ajustes."
    };
  }

  if (!env.NETLIFY_BUILD_HOOK) {
    return {
      triggered: false,
      reason: "Falta configurar NETLIFY_BUILD_HOOK en Netlify."
    };
  }

  const response = await fetch(env.NETLIFY_BUILD_HOOK, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ source: "cueva-cms", at: new Date().toISOString() }),
    signal: AbortSignal.timeout(10000)
  });

  if (!response.ok) {
    return {
      triggered: false,
      reason: `Netlify respondió ${response.status}. Revisa el build hook.`
    };
  }

  await supabase.from("settings").upsert(
    {
      key: "build",
      value: {
        ...build,
        lastTriggeredAt: new Date().toISOString(),
        lastTriggeredBy: actor.email
      },
      updated_by: actor.id
    },
    { onConflict: "key" }
  );

  await audit({
    actor,
    action: "build.trigger",
    entity: "settings",
    entityId: "build",
    diff: { forced: Boolean(options.force) }
  });

  return { triggered: true, reason: "Build iniciado en Netlify." };
}

export async function publishRelease(
  input: z.infer<typeof releaseSchema>,
  actor: AdminUser
) {
  const supabase = getSupabase();
  const releasedAt = new Date();
  const updatedAt = releasedAt.toISOString().slice(0, 10);

  const { data: release, error } = await supabase
    .from("site_releases")
    .insert({
      version: input.version,
      notes: input.notes || null,
      released_at: releasedAt.toISOString()
    })
    .select("*")
    .single();

  if (error) throw error;

  const { data: siteRow } = await supabase
    .from("settings")
    .select("value")
    .eq("key", "site")
    .maybeSingle();

  await supabase.from("settings").upsert(
    {
      key: "site",
      value: {
        ...((siteRow?.value || {}) as Record<string, unknown>),
        version: input.version,
        updatedAt
      },
      updated_by: actor.id
    },
    { onConflict: "key" }
  );

  const build = await triggerBuild(actor, { force: true });

  await audit({
    actor,
    action: "release.publish",
    entity: "release",
    entityId: String(release.id),
    diff: { version: input.version, notes: input.notes || null, build }
  });

  return { release, build };
}
