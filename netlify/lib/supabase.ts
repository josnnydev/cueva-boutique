import {
  createClient,
  type SupabaseClient,
  type WebSocketLikeConstructor
} from "@supabase/supabase-js";
import ws from "ws";
import { env } from "./env";

let adminClient: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase no está configurado en las variables de entorno.");
  }

  if (!adminClient) {
    adminClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      },
      // Netlify Functions corre en Node 20, que no trae WebSocket global.
      realtime: { transport: ws as unknown as WebSocketLikeConstructor },
      global: {
        headers: { "X-Client-Info": "cueva-cms-functions" }
      }
    });
  }

  return adminClient;
}

// Cliente desechable para iniciar sesión con correo y contraseña.
// No debe usarse el cliente admin: signInWithPassword guarda la sesión del
// usuario en memoria y las siguientes consultas REST perderían el service_role.
export function createAuthClient(): SupabaseClient {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase no está configurado en las variables de entorno.");
  }

  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    },
    realtime: { transport: ws as unknown as WebSocketLikeConstructor },
    global: {
      headers: { "X-Client-Info": "cueva-cms-auth" }
    }
  });
}

export function publicImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  const { data } = getSupabase().storage.from("product-images").getPublicUrl(path);
  return data.publicUrl || null;
}
