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

async function mirrorImage(base, storagePath, slug, kind, hasThumb, key = slug) {
  if (!storagePath) return null;

  const fileName = kind === "thumb" ? `${key}-thumb.webp` : `${key}.webp`;
  const target = path.join(imageDir, fileName);
  const relative = `assets/img/productos/${fileName}`;

  if (kind === "thumb" && !hasThumb && existsSync(path.join(imageDir, `${key}.webp`))) {
    return `assets/img/productos/${key}.webp`;
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
    const fullLocal = path.join(imageDir, `${key}.webp`);
    if (existsSync(fullLocal)) return `assets/img/productos/${key}.webp`;
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
      const gallery = (
        Array.isArray(product.images) && product.images.length
          ? product.images.map((image) => image.src)
          : [product.imageSrc]
      ).filter(Boolean);
      const absoluteImages = gallery.map((source) =>
        /^https?:\/\//.test(source) ? source : new URL(source, canonical).href
      );

      return {
        "@type": "ListItem",
        position: index + 1,
        item: {
          "@type": "Product",
          name: product.name,
          image: absoluteImages.length === 1 ? absoluteImages[0] : absoluteImages,
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

  const [productsResult, settingsResult, imagesResult] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, slug, legacy_anchor, name, short_description, description, price, compare_at_price, base_discount, badge, offer_eligible, sort_order, updated_at, is_active, category:categories(id, slug, name, sort_order, is_active)"
      )
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase.from("settings").select("key,value").in("key", ["store", "site", "daily_offers"]),
    supabase
      .from("product_images")
      .select("id,product_id,storage_path,thumb_path,alt,width,height,is_primary,sort_order")
      .order("is_primary", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
  ]);

  if (productsResult.error) throw productsResult.error;
  if (settingsResult.error) throw settingsResult.error;
  if (imagesResult.error) throw imagesResult.error;

  const galleryByProduct = new Map();
  for (const image of imagesResult.data || []) {
    const list = galleryByProduct.get(image.product_id) || [];
    list.push(image);
    galleryByProduct.set(image.product_id, list);
  }

  const rows = (productsResult.data || [])
    .filter((row) => row.category && row.category.is_active !== false)
    .sort((a, b) => {
      const categoryOrder = Number(a.category.sort_order || 0) - Number(b.category.sort_order || 0);
      if (categoryOrder !== 0) return categoryOrder;
      const sortOrder = Number(a.sort_order || 0) - Number(b.sort_order || 0);
      if (sortOrder !== 0) return sortOrder;
      return String(a.name).localeCompare(String(b.name), "es");
    });
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
    const galleryRows = galleryByProduct.get(row.id) || [];
    const gallery = [];

    if (galleryRows.length) {
      const mirrored = await Promise.all(
        galleryRows.map(async (image) => {
          const key = image.is_primary ? row.slug : `${row.slug}-${String(image.id).slice(0, 8)}`;
          const full = await mirrorImage(
            url,
            image.storage_path,
            row.slug,
            "full",
            Boolean(image.thumb_path),
            key
          );
          const thumb = image.thumb_path
            ? await mirrorImage(url, image.thumb_path, row.slug, "thumb", true, key)
            : full;

          if (!full) return null;
          return {
            src: full,
            thumb: thumb || full,
            alt: image.alt || row.name,
            width: image.width || 480,
            height: image.height || 480
          };
        })
      );
      for (const item of mirrored) {
        if (item) gallery.push(item);
      }
    }

    if (!gallery.length) {
      log(`El producto ${row.slug} no tiene fotos; se usará la imagen de la tienda.`);
    }

    const primary = gallery[0];

    products.push({
      slug: row.slug,
      anchor: row.legacy_anchor || `product-${row.slug}`,
      name: row.name,
      shortDescription: row.short_description || "",
      price: Number(row.price),
      compareAtPrice:
        row.compare_at_price === null || row.compare_at_price === undefined
          ? null
          : Number(row.compare_at_price),
      baseDiscount: Number(row.base_discount || 0),
      badge: row.badge || "",
      categorySlug: row.category.slug,
      categoryName: row.category.name,
      offerEligible: Boolean(row.offer_eligible),
      soldOut: row.is_active === false,
      images: gallery,
      imageSrc: primary?.src || "assets/img/logo-cueva.webp",
      imageThumb: primary?.thumb || primary?.src || "assets/img/logo-cueva.webp",
      imageAlt: primary?.alt || row.name,
      imageWidth: primary?.width || 480,
      imageHeight: primary?.height || 480,
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

  const version = String(site.version || "1.4.0");
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
