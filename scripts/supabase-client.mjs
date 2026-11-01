import { createClient } from "@supabase/supabase-js";
import ws from "ws";

// Node 20 no expone WebSocket global y supabase-js inicializa Realtime
// aunque no se use. Le pasamos `ws` para que funcione en local y en Netlify.
export function createSupabaseClient(url, key, options = {}) {
  return createClient(url, key, {
    ...options,
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      ...(options.auth || {})
    },
    realtime: {
      transport: ws,
      ...(options.realtime || {})
    }
  });
}
