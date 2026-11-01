import { createSupabaseClient } from "./supabase-client.mjs";

const url = String(process.env.SUPABASE_URL || "").trim();
const serviceKey = String(
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ""
).trim();
const sessionSecret = String(process.env.SESSION_SECRET || "").trim();

const problems = [];
const steps = [];

function ok(message) {
  console.log(`  ✓ ${message}`);
}

function bad(message) {
  problems.push(message);
  console.log(`  ✗ ${message}`);
}

function info(message) {
  console.log(`  · ${message}`);
}

console.log("\nCueva Boutique · diagnóstico de configuración\n");

console.log("Variables de entorno:");
if (url) ok("SUPABASE_URL definida");
else bad("Falta SUPABASE_URL en .env");

if (serviceKey) {
  if (serviceKey.startsWith("sb_publishable_")) {
    bad("SUPABASE_SECRET_KEY es una clave pública (sb_publishable_...): usa la secreta (sb_secret_...)");
  } else if (serviceKey.startsWith("sb_secret_")) {
    ok("SUPABASE_SECRET_KEY definida (clave secreta nueva)");
  } else if (serviceKey.startsWith("eyJ")) {
    let role = "";
    try {
      role = JSON.parse(Buffer.from(serviceKey.split(".")[1], "base64url").toString()).role || "";
    } catch {
      role = "";
    }
    if (role === "service_role") {
      ok("SUPABASE_SECRET_KEY definida (service_role heredada)");
      info("Supabase retira las claves heredadas a finales de 2026; puedes migrar a sb_secret_...");
    } else {
      bad(`La clave parece una JWT con rol "${role || "desconocido"}": usa service_role o sb_secret_...`);
    }
  } else {
    ok("SUPABASE_SECRET_KEY definida (formato no reconocido; se probará la conexión)");
  }
} else {
  bad("Falta SUPABASE_SECRET_KEY en .env (Settings → API Keys → clave secreta)");
}

if (url && !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) {
  bad("SUPABASE_URL no tiene el formato https://<proyecto>.supabase.co");
}

if (sessionSecret.length >= 32) ok("SESSION_SECRET tiene 32+ caracteres");
else bad("Falta SESSION_SECRET o tiene menos de 32 caracteres");

if (!url || !serviceKey) {
  console.log("\nCompleta .env y vuelve a ejecutar: npm run doctor\n");
  process.exitCode = 1;
} else {
  const supabase = createSupabaseClient(url, serviceKey);

  console.log("\nBase de datos:");

  const tables = [
    { name: "categories", column: "id" },
    { name: "products", column: "id" },
    { name: "product_images", column: "id" },
    { name: "settings", column: "key" },
    { name: "site_releases", column: "id" },
    { name: "admin_profiles", column: "user_id" },
    { name: "audit_log", column: "id" },
    { name: "login_attempts", column: "id" }
  ];

  const counts = {};

  for (const table of tables) {
    // Nota: no usar head:true; PostgREST responde 204 aunque la tabla no exista
    // y el error se pierde. Con limit(0) el 404 sí se detecta.
    const { count, error } = await supabase
      .from(table.name)
      .select(table.column, { count: "exact" })
      .limit(0);

    if (error) {
      bad(`Tabla ${table.name}: ${error.message}`);
    } else {
      counts[table.name] = count || 0;
      ok(`Tabla ${table.name} (${count || 0})`);
    }
  }

  console.log("\nStorage:");
  const { data: bucket, error: bucketError } = await supabase.storage.getBucket(
    "product-images"
  );
  if (bucketError) {
    bad(`Bucket product-images: ${bucketError.message}`);
  } else if (!bucket) {
    bad("El bucket product-images no existe");
  } else {
    ok(`Bucket product-images (público: ${bucket.public ? "sí" : "no"})`);
  }

  console.log("\nCatálogo:");
  if (counts.categories > 0) ok(`${counts.categories} categorías`);
  else bad("No hay categorías: ejecuta supabase/seed.sql");

  if (counts.products > 0) {
    ok(`${counts.products} productos`);
    steps.push("Abre /admin/ y revisa que los productos tengan foto.");
  } else {
    bad("No hay productos: ejecuta npm run seed");
  }

  if (counts.product_images > 0) {
    ok(`${counts.product_images} fotos registradas`);
  } else {
    bad("No hay fotos registradas: ejecuta npm run seed");
  }

  console.log("\nAdministrador:");

  if (counts.admin_profiles > 0) {
    ok(`${counts.admin_profiles} perfil(es) de administrador`);

    const { data: profiles } = await supabase
      .from("admin_profiles")
      .select("email,is_active")
      .limit(3);

    for (const profile of profiles || []) {
      info(`${profile.email} · ${profile.is_active ? "activo" : "desactivado"}`);
    }
  } else {
    bad("No hay administradores: crea uno en Supabase Auth y su fila en admin_profiles");
  }

  const { data: users, error: usersError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 5
  });

  if (usersError) {
    bad(`No se pudo listar usuarios de Auth: ${usersError.message}`);
  } else {
    ok(`${users.users.length} usuario(s) en Supabase Auth`);
    for (const user of users.users) {
      info(`${user.email || "sin correo"} · ${user.email_confirmed_at ? "confirmado" : "sin confirmar"}`);
    }
  }

  console.log("\nAjustes:");
  const { data: settings } = await supabase
    .from("settings")
    .select("key,value");

  for (const row of settings || []) {
    if (row.key === "site") {
      info(`Versión publicada: ${row.value?.version || "sin versión"}`);
    }
  }

  if (!(settings || []).some((row) => row.key === "site")) {
    bad("Falta el ajuste site: ejecuta supabase/seed.sql");
  }
}

if (problems.length) {
  console.log(`\n${problems.length} pendiente(s):\n`);
  for (const problem of problems) console.log(`  - ${problem}`);
  console.log("\nSiguiente paso: revisa README.md → Configurar Supabase.\n");
  process.exitCode = 1;
} else {
  console.log("\nTodo listo para usar el CMS.");
  for (const step of steps) console.log(`  → ${step}`);
  console.log("");
}
