import fs from "node:fs/promises";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseCatalog } from "./seed-catalog.mjs";

const root = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const dist = path.join(root, "dist");

const problems = [];
const notes = [];

function fail(message) {
  problems.push(message);
}

function note(message) {
  notes.push(message);
}

async function checkImage(url) {
  try {
    const response = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(15000) });
    if (!response.ok) fail(`Imagen no disponible (${response.status}): ${url}`);
  } catch (error) {
    fail(`Imagen no accesible: ${url} (${error.message})`);
  }
}

async function verifyRemote(base) {
  const endpoint = new URL("/api/public/catalog", base).href;
  const response = await fetch(endpoint, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20000)
  });

  if (!response.ok) {
    fail(`La API respondió ${response.status} en ${endpoint}`);
    return;
  }

  const payload = await response.json();
  if (!payload?.ok || !payload?.data) {
    fail("La API no devolvió el sobre { ok, data }.");
    return;
  }

  const catalog = payload.data;
  const products = catalog.products || [];
  if (!products.length) fail("El catálogo público está vacío.");
  if (!catalog.site?.version) fail("El catálogo no incluye la versión del sitio.");

  const anchors = new Set();
  const imageUrls = new Set();

  products.forEach((product, index) => {
    const label = `producto #${index + 1} (${product.name || "sin nombre"})`;
    for (const field of ["id", "slug", "anchor", "name", "price", "category"]) {
      if (!product[field]) fail(`${label}: falta ${field}.`);
    }
    if (product.price <= 0) fail(`${label}: precio inválido (${product.price}).`);
    if (!product.category?.slug || !product.category?.name) {
      fail(`${label}: categoría incompleta.`);
    }
    if (anchors.has(product.anchor)) fail(`${label}: anchor duplicado (${product.anchor}).`);
    anchors.add(product.anchor);

    if (product.image?.src) imageUrls.add(product.image.src);
    if (product.image?.thumb) imageUrls.add(product.image.thumb);
  });

  const categories = catalog.categories || [];
  if (!categories.length) fail("No hay categorías activas en el catálogo.");
  for (let index = 1; index < categories.length; index += 1) {
    if (categories[index - 1].count < categories[index].count) {
      // Solo informativo: el orden es por sort_order, no por cantidad.
      break;
    }
  }

  note(`${products.length} productos y ${categories.length} categorías publicados.`);
  note(`Versión: ${catalog.site.version} · actualizado ${catalog.site.updatedAt || "sin fecha"}.`);

  const sample = Array.from(imageUrls);
  const batch = [];
  for (const url of sample) batch.push(checkImage(url));
  await Promise.all(batch);
  note(`Se verificaron ${sample.length} URLs de imagen.`);

  // Comprobar que la tienda pública muestra los anchors actuales.
  try {
    const home = await fetch(new URL("/", base).href, { signal: AbortSignal.timeout(20000) });
    const html = await home.text();
    if (!home.ok) fail(`La tienda respondió ${home.status}.`);

    for (const product of products) {
      if (!html.includes(`id="${product.anchor}"`)) {
        fail(`La tienda publicada no contiene el anchor ${product.anchor}.`);
      }
    }
    if (html.includes("js/catalog.js")) {
      fail("La tienda publicada todavía carga js/catalog.js (se esperaba catálogo estático).");
    }
    if (!html.includes("srcset=")) {
      fail("La tienda publicada no usa srcset en las imágenes de producto.");
    }
  } catch (error) {
    fail(`No se pudo leer la tienda publicada: ${error.message}`);
  }
}

async function verifyLocalBuild() {
  const indexPath = path.join(dist, "index.html");
  if (!existsSync(indexPath)) {
    note("No hay dist/index.html: se omite la verificación local.");
    return;
  }

  const html = await fs.readFile(indexPath, "utf8");
  const products = parseCatalog(html);
  if (!products.length) fail("dist/index.html no contiene tarjetas de producto.");
  if (html.includes("js/catalog.js")) {
    fail("dist/index.html todavía carga js/catalog.js (el catálogo ya es estático).");
  }
  if (!html.includes("srcset=")) {
    fail("dist/index.html no usa srcset en las imágenes de producto.");
  }
  if (!html.includes('fetchpriority="high"')) {
    fail("dist/index.html no prioriza la primera imagen visible.");
  }

  const adminIndex = path.join(dist, "admin", "index.html");
  if (!existsSync(adminIndex)) {
    fail("dist/admin/index.html no existe: el panel no se compiló.");
  }

  const versionMatch = html.match(/data-site-version>([^<]*)</);
  note(
    `Build local: ${products.length} productos · versión ${versionMatch?.[1] || "desconocida"}.`
  );

  for (const product of products) {
    if (!html.includes(`id="${product.anchor}"`)) {
      fail(`Build local: falta el anchor ${product.anchor}.`);
    }
    if (!product.imageSrc) {
      fail(`Build local: ${product.name} no tiene imagen.`);
    }
  }
}

async function main() {
  const base = process.argv[2] || process.env.SITE_URL || "";

  if (base) {
    await verifyRemote(base);
  } else {
    note("Sin URL: solo se verifica el build local (usa `npm run verify -- https://tu-sitio`).");
  }

  await verifyLocalBuild();

  for (const line of notes) console.log(`[verify] ${line}`);

  if (problems.length) {
    console.error(`\n[verify] ${problems.length} problema(s):`);
    for (const problem of problems) console.error(`  ✗ ${problem}`);
    process.exitCode = 1;
    return;
  }

  console.log("\n[verify] Todo correcto.");
}

main().catch((error) => {
  console.error(`[verify] Error: ${error.message}`);
  process.exitCode = 1;
});
