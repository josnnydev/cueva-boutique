import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSupabaseClient } from "./supabase-client.mjs";
import { renderProductGrid } from "./render-card.mjs";

const root = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const dist = path.join(root, "dist");
const imageDir = path.join(dist, "assets", "img", "productos");

const COPY_FILES = ["index.html", "_headers", "robots.txt", "sitemap.xml", "404.html"];
const COPY_DIRS = ["css", "js", "assets"];

function log(message) {
  console.log(`[build-store] ${message}`);
}

function supabaseKey() {
  return String(
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  ).trim();
}

async function copyBase() {
  await fs.rm(dist, { recursive: true, force: true });
  await fs.mkdir(dist, { recursive: true });

  for (const file of COPY_FILES) {
    const source = path.join(root, file);
    if (existsSync(source)) {
      await fs.copyFile(source, path.join(dist, file));
    }
  }

  for (const dir of COPY_DIRS) {
    const source = path.join(root, dir);
    if (existsSync(source)) {
      await fs.cp(source, path.join(dist, dir), { recursive: true });
    }
  }

  await fs.mkdir(imageDir, { recursive: true });
}

function publicStorageUrl(base, storagePath) {
  const encoded = String(storagePath)
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${base.replace(/\/+$/, "")}/storage/v1/object/public/product-images/${encoded}`;
}

async function mirrorImage(base, storagePath, slug, kind, hasThumb) {
  if (!storagePath) return null;

  const fileName = kind === "thumb" ? `${slug}-thumb.webp` : `${slug}.webp`;
  const target = path.join(imageDir, fileName);
  const relative = `assets/img/productos/${fileName}`;

  if (kind === "thumb" && !hasThumb && existsSync(path.join(imageDir, `${slug}.webp`))) {
    return `assets/img/productos/${slug}.webp`;
  }

  try {
    const response = await fetch(publicStorageUrl(base, storagePath), {
      signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(target, buffer);
    return relative;
  } catch (error) {
    if (existsSync(target)) return relative;
    const fullLocal = path.join(imageDir, `${slug}.webp`);
    if (existsSync(fullLocal)) return `assets/img/productos/${slug}.webp`;
    log(`No se pudo copiar ${storagePath}: ${error.message}. Se usará la URL remota.`);
    return publicStorageUrl(base, storagePath);
  }
}

function formatDateDisplay(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  return `${match[3]}/${match[2]}/${match[1]}`;
}

async function updateRuntimeConfig({ store, site, offers }) {
  const file = path.join(dist, "js", "config.js");
  if (!existsSync(file)) return;

  let text = await fs.readFile(file, "utf8");
  const asString = (value) => JSON.stringify(String(value ?? ""));

  const scalar = (key, value) => {
    if (value === undefined || value === null || value === "") return;
    const pattern = new RegExp(`(\\b${key}:\\s*)"[^"]*"`);
    text = text.replace(pattern, `$1${asString(value)}`);
  };

  scalar("storeName", store.name);
  scalar("version", site.version);
  scalar("updatedAt", site.updatedAt);
  scalar("whatsappNumber", store.whatsapp);
  scalar("generalLink", store.generalLink);
  scalar("instagramHandle", store.instagramHandle);
  scalar("instagramUrl", store.instagramUrl);
  scalar("locale", store.locale);
  scalar("currency", store.currency);
  scalar("currencySymbol", store.currencySymbol);

  if (offers && Object.keys(offers).length) {
    const block = Object.keys(offers)
      .map((key) => `    ${key}: ${JSON.stringify(offers[key])}`)
      .join(",\n");
    text = text.replace(/dailyOffers:\s*\{[\s\S]*?\n  \}/, `dailyOffers: {\n${block}\n  }`);
  }

  await fs.writeFile(file, text, "utf8");
  log("Configuración de la tienda sincronizada con Supabase.");
}

function updateJsonLd(html, products, canonical) {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!match) return html;

  try {
    const data = JSON.parse(match[1]);
    const itemList = (data["@graph"] || []).find((node) => node["@type"] === "ItemList");
    if (!itemList) return html;

    itemList.numberOfItems = products.length;
    itemList.itemListElement = products.map((product, index) => {
      const absoluteImage = /^https?:\/\//.test(product.imageSrc)
        ? product.imageSrc
        : new URL(product.imageSrc, canonical).href;

      return {
        "@type": "ListItem",
        position: index + 1,
        item: {
          "@type": "Product",
          name: product.name,
          image: absoluteImage,
          description: product.shortDescription,
          category: product.categoryName,
          brand: {
            "@type": "Brand",
            name: product.name.split(/\s+/)[0] || "Cueva Boutique"
          },
          offers: {
            "@type": "Offer",
            price: Number(product.price),
            priceCurrency: product.currency || "DOP",
            availability: "https://schema.org/InStock",
            url: new URL(`#${product.anchor}`, canonical).href
          }
        }
      };
    });

    const serialized = JSON.stringify(data, null, 2);
    return html.replace(match[0], `<script type="application/ld+json">\n${serialized}\n</script>`);
  } catch (error) {
    log(`No se pudo actualizar JSON-LD: ${error.message}`);
    return html;
  }
}

async function generateCatalog() {
  const url = process.env.SUPABASE_URL;
  const key = supabaseKey();

  if (!url || !key) {
    log("Sin SUPABASE_URL o SUPABASE_SECRET_KEY: se publica la tienda actual sin regenerar tarjetas.");
    return;
  }

  const supabase = createSupabaseClient(url, key);

  const [productsResult, settingsResult] = await Promise.all([
    supabase
      .from("catalog_public")
      .select("*")
      .order("category_sort_order", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase.from("settings").select("key,value").in("key", ["store", "site", "daily_offers"])
  ]);

  if (productsResult.error) throw productsResult.error;
  if (settingsResult.error) throw settingsResult.error;

  const rows = productsResult.data || [];
  if (!rows.length) {
    log("El catálogo está vacío: se conserva la tienda actual para no publicar una tienda sin productos.");
    return;
  }

  const storeRow = (settingsResult.data || []).find((row) => row.key === "store");
  const siteRow = (settingsResult.data || []).find((row) => row.key === "site");
  const offersRow = (settingsResult.data || []).find((row) => row.key === "daily_offers");
  const store = (storeRow?.value || {});
  const site = (siteRow?.value || {});
  const offers = (offersRow?.value || {});
  const currencySymbol = store.currencySymbol || "$";

  const products = [];
  for (const row of rows) {
    const full = await mirrorImage(url, row.image_path, row.slug, "full", Boolean(row.thumb_path));
    const thumb = row.thumb_path
      ? await mirrorImage(url, row.thumb_path, row.slug, "thumb", true)
      : full;

    products.push({
      slug: row.slug,
      anchor: row.anchor,
      name: row.name,
      shortDescription: row.short_description || "",
      price: Number(row.price),
      compareAtPrice:
        row.compare_at_price === null || row.compare_at_price === undefined
          ? null
          : Number(row.compare_at_price),
      baseDiscount: Number(row.base_discount || 0),
      badge: row.badge || "",
      categorySlug: row.category_slug,
      categoryName: row.category_name,
      offerEligible: Boolean(row.offer_eligible),
      imageSrc: full || "assets/img/logo-cueva.webp",
      imageThumb: thumb || full || "assets/img/logo-cueva.webp",
      imageAlt: row.image_alt || row.name,
      imageWidth: row.image_width || 480,
      imageHeight: row.image_height || 480,
      currencySymbol,
      currency: store.currency || "DOP"
    });
  }

  const indexPath = path.join(dist, "index.html");
  let html = await fs.readFile(indexPath, "utf8");

  const marker = '<div class="product-grid" id="product-grid">';
  const start = html.indexOf(marker);
  const emptyMarker = '<p class="catalog__empty"';
  const emptyIndex = html.indexOf(emptyMarker, start);

  if (start === -1 || emptyIndex === -1) {
    log("No se encontró el grid de productos: se conserva el HTML actual.");
    return;
  }

  const gridClose = html.lastIndexOf("</div>", emptyIndex);
  const gridHtml = renderProductGrid(products);
  html =
    html.slice(0, start + marker.length) +
    "\n" +
    gridHtml +
    "\n        " +
    html.slice(gridClose);

  const canonicalMatch = html.match(/<link rel="canonical" href="([^"]+)"/);
  const canonical = canonicalMatch?.[1] || "https://cueva-boutique.netlify.app/";
  html = updateJsonLd(html, products, canonical);

  const version = String(site.version || "1.2.0");
  const updatedAt = formatDateDisplay(String(site.updatedAt || "")) || "";

  html = html.replace(
    /(<span data-site-version>)[^<]*(<\/span>)/,
    `$1${version}$2`
  );
  html = html.replace(
    /(<span data-site-updated>)[^<]*(<\/span>)/,
    `$1${updatedAt}$2`
  );
  html = html.replace(/\?v=[\d.]+/g, `?v=${version}`);

  await updateRuntimeConfig({ store, site, offers });

  await fs.writeFile(indexPath, html, "utf8");

  const today = new Date().toISOString().slice(0, 10);
  const sitemapPath = path.join(dist, "sitemap.xml");
  if (existsSync(sitemapPath)) {
    const sitemap = await fs.readFile(sitemapPath, "utf8");
    await fs.writeFile(
      sitemapPath,
      sitemap.replace(/<lastmod>[^<]*<\/lastmod>/, `<lastmod>${today}</lastmod>`),
      "utf8"
    );
  }

  log(`Catálogo generado: ${products.length} productos · versión ${version}.`);
}

async function main() {
  await copyBase();
  try {
    await generateCatalog();
  } catch (error) {
    log(`No se pudo regenerar el catálogo (${error.message}). Se publica la tienda actual.`);
  }
  log("Tienda copiada a dist/.");
}

main().catch((error) => {
  console.error("[build-store] Error fatal:", error);
  process.exitCode = 1;
});
