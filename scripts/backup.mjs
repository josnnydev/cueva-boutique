import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSupabaseClient } from "./supabase-client.mjs";

const root = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const BACKUP_ROOT = path.join(root, "backups");

const TABLES = [
  "admin_profiles",
  "categories",
  "products",
  "product_images",
  "settings",
  "site_releases"
];

function requiredEnv(name, ...fallbacks) {
  const value = [name, ...fallbacks]
    .map((key) => String(process.env[key] || "").trim())
    .find(Boolean);
  if (!value) throw new Error(`Falta la variable ${name}.`);
  return value;
}

function supabaseKey() {
  return requiredEnv("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY");
}

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

export async function backup({ url, key }) {
  const supabase = createSupabaseClient(url, key);

  const directory = path.join(BACKUP_ROOT, stamp());
  const imagesDirectory = path.join(directory, "images");
  await fs.mkdir(imagesDirectory, { recursive: true });

  const manifest = {
    createdAt: new Date().toISOString(),
    tables: {},
    images: { downloaded: 0, failed: 0 }
  };

  for (const table of TABLES) {
    const { data, error } = await supabase.from(table).select("*");
    if (error) throw new Error(`${table}: ${error.message}`);
    await fs.writeFile(
      path.join(directory, `${table}.json`),
      JSON.stringify(data || [], null, 2),
      "utf8"
    );
    manifest.tables[table] = (data || []).length;
    console.log(`[backup] ${table}: ${(data || []).length} filas`);
  }

  const { data: images, error: imageError } = await supabase
    .from("product_images")
    .select("id,storage_path,thumb_path");

  if (imageError) throw imageError;

  for (const image of images || []) {
    for (const storagePath of [image.storage_path, image.thumb_path].filter(Boolean)) {
      const target = path.join(imagesDirectory, storagePath.replace(/\//g, "__"));
      try {
        const { data, error } = await supabase.storage
          .from("product-images")
          .download(storagePath);

        if (error) throw error;
        await fs.writeFile(target, Buffer.from(await data.arrayBuffer()));
        manifest.images.downloaded += 1;
      } catch (error) {
        manifest.images.failed += 1;
        console.warn(`[backup] No se pudo descargar ${storagePath}: ${error.message}`);
      }
    }
  }

  await fs.writeFile(
    path.join(directory, "manifest.json"),
    JSON.stringify(manifest, null, 2),
    "utf8"
  );

  console.log(
    `[backup] Guardado en ${path.relative(root, directory)} · ` +
      `${manifest.images.downloaded} imágenes, ${manifest.images.failed} fallidas.`
  );

  return directory;
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  backup({
    url: requiredEnv("SUPABASE_URL"),
    key: supabaseKey()
  }).catch((error) => {
    console.error(`[backup] Error: ${error.message}`);
    process.exitCode = 1;
  });
}
