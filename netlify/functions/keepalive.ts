import type { Handler } from "@netlify/functions";
import { getSupabase } from "../lib/supabase";

/**
 * Netlify ejecuta esta función una vez al día para que Supabase no pause
 * el proyecto gratuito por inactividad.
 */
export const config = {
  schedule: "@daily"
};

export const handler: Handler = async () => {
  try {
    const { error } = await getSupabase()
      .from("categories")
      .select("id")
      .limit(1);

    if (error) throw error;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ ok: true, at: new Date().toISOString() })
    };
  } catch (error) {
    console.error("[keepalive]", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ ok: false })
    };
  }
};
