import { fileURLToPath } from "node:url";
import path from "node:path";
import { createSupabaseClient } from "./supabase-client.mjs";

function log(message) {
  console.log(`[admin] ${message}`);
}

export async function createAdmin({ url, key, email, password, name }) {
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error("ADMIN_EMAIL no es un correo válido.");
  }
  if (!password || password.length < 8) {
    throw new Error("ADMIN_PASSWORD debe tener al menos 8 caracteres.");
  }

  const supabase = createSupabaseClient(url, key);

  const { data: list, error: listError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000
  });
  if (listError) throw listError;

  const existing = list.users.find(
    (user) => user.email?.toLowerCase() === email.toLowerCase()
  );

  let userId = existing?.id;

  if (!userId) {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true
    });
    if (error) throw error;
    userId = data.user.id;
    log(`Usuario creado y confirmado: ${email}`);
  } else {
    const { error } = await supabase.auth.admin.updateUserById(userId, { password });
    if (error) throw error;
    log(`El usuario ya existía; contraseña actualizada: ${email}`);
  }

  const { error: profileError } = await supabase.from("admin_profiles").upsert(
    {
      user_id: userId,
      email,
      full_name: name || "Administrador",
      is_active: true
    },
    { onConflict: "user_id" }
  );
  if (profileError) throw profileError;

  log(`Perfil de administrador activo (${userId}).`);
  log("Ya puedes entrar en /admin/ con ese correo y contraseña.");
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  const email = String(process.env.ADMIN_EMAIL || "").trim();
  const password = String(process.env.ADMIN_PASSWORD || "").trim();
  const name = String(process.env.ADMIN_NAME || "Administrador").trim();
  const url = String(process.env.SUPABASE_URL || "").trim();
  const key = String(
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  ).trim();

  if (!url || !key) {
    console.error("[admin] Falta SUPABASE_URL o SUPABASE_SECRET_KEY en .env");
    process.exitCode = 1;
  } else {
    createAdmin({ url, key, email, password, name }).catch((error) => {
      console.error(`[admin] Error: ${error.message}`);
      process.exitCode = 1;
    });
  }
}
