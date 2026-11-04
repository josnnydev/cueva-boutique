import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createSupabaseClient } from "./supabase-client.mjs";

const root = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const IMAGE_DIR = path.join(root, "assets", "img", "productos");
const BUCKET = "product-images";

const CATEGORY_NAMES = {
  audifonos: "Audífonos",
  cables: "Cables",
  accesorios: "Accesorios",
  relojes: "Relojes",
  lifestyle: "Lifestyle"
};

const CATEGORY_ORDER = ["audifonos", "cables", "accesorios", "relojes", "lifestyle"];

function decodeEntities(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function attribute(block, name) {
  const match = block.match(new RegExp(`${name}="([^"]*)"`));
  return match ? decodeEntities(match[1]) : "";
}

function textOf(block, pattern) {
  const match = block.match(pattern);
  return match ? decodeEntities(match[1]) : "";
}

export function parseCatalog(html) {
  const products = [];
  const articlePattern =
    /<article\b[^>]*class="product-card(?:\s[^"]*)?"[^>]*>([\s\S]*?)<\/article>/g;
  let match;
  let index = 0;

  while ((match = articlePattern.exec(html))) {
    const opening = match[0].slice(0, match[0].indexOf(">") + 1);
    if (!/\bdata-product-card\b/.test(opening)) continue;

    const body = match[1];
    const anchor = attribute(opening, "id");
    if (!anchor) continue;

    const slug = anchor.replace(/^product-/, "");
    const imageTag = body.match(/<img\b[^>]*>/);
    const imageBlock = imageTag ? imageTag[0] : "";

    products.push({
      anchor,
      slug,
      name: attribute(opening, "data-name") || textOf(body, /<h3[^>]*>([\s\S]*?)<\/h3>/),
      price: Number(attribute(opening, "data-price")) || 0,
      compareAtPrice: attribute(opening, "data-old-price")
        ? Number(attribute(opening, "data-old-price"))
        : null,
      categorySlug: attribute(opening, "data-category") || "otros",
      badge: textOf(body, /class="product-card__tag"[^>]*>([\s\S]*?)<\/span>/),
      shortDescription: textOf(body, /class="product-card__desc"[^>]*>([\s\S]*?)<\/p>/),
      permanentOffer: /\bdata-permanent-offer\b/.test(opening),
      imageSrc: imageBlock ? attribute(imageBlock, "src") : "",
      imageAlt:
        (imageBlock ? attribute(imageBlock, "alt") : "") ||
        attribute(opening, "data-name"),
      imageWidth: imageBlock ? Number(attribute(imageBlock, "width")) || null : null,
      imageHeight: imageBlock ? Number(attribute(imageBlock, "height")) || null : null,
      sortOrder: index
    });

    index += 1;
  }

  return products;
}

function requiredEnv(name, ...fallbacks) {
  const value = [name, ...fallbacks]
    .map((key) => String(process.env[key] || "").trim())
    .find(Boolean);
  if (!value) throw new Error(`Falta la variable ${name}. Copia .env.example a .env y complétala.`);
  return value;
}

function supabaseKey() {
  return requiredEnv("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY");
}

function log(message) {
  console.log(`[seed] ${message}`);
}

async function uploadImage(supabase, product, filePath, contentType) {
  const buffer = await fs.readFile(filePath);
  const extension = path.extname(filePath).replace(".", "") || "webp";
  const storagePath = `products/${product.slug}/${crypto.randomUUID()}-full.${extension}`;

  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType,
    upsert: false
  });

  if (error) throw error;
  return { storagePath, bytes: buffer.length };
}

async function ensureBucket(supabase) {
  const { data: bucket, error } = await supabase.storage.getBucket("product-images");

  if (error && !/not found/i.test(error.message)) throw error;

  if (bucket) {
    log("Bucket product-images ya existe.");
    return;
  }

  const { error: createError } = await supabase.storage.createBucket("product-images", {
    public: true,
    fileSizeLimit: 5242880,
    allowedMimeTypes: ["image/webp", "image/jpeg", "image/png"]
  });

  if (createError) throw createError;
  log("Bucket product-images creado (público, 5 MB, WebP/JPEG/PNG).");
}

export async function seed({ url, key, adminEmail, adminPassword, adminName }) {
  const supabase = createSupabaseClient(url, key);

  await ensureBucket(supabase);

  const html = await fs.readFile(path.join(root, "index.html"), "utf8");
  const products = parseCatalog(html);

  if (!products.length) {
    throw new Error("No se encontraron productos en index.html.");
  }

  log(`Encontrados ${products.length} productos en la tienda actual.`);

  // Categorías
  const categoryIds = new Map();
  const slugs = Array.from(new Set(products.map((product) => product.categorySlug)));

  for (const slug of slugs) {
    const name = CATEGORY_NAMES[slug] || slug.replace(/-/g, " ");
    const sortOrder = CATEGORY_ORDER.indexOf(slug) === -1 ? 99 : CATEGORY_ORDER.indexOf(slug) + 1;

    const { data, error } = await supabase
      .from("categories")
      .upsert({ slug, name, sort_order: sortOrder, is_active: true }, { onConflict: "slug" })
      .select("id,slug")
      .single();

    if (error) throw error;
    categoryIds.set(slug, data.id);
  }

  log(`Categorías listas: ${slugs.join(", ")}.`);

  // Productos
  let created = 0;
  let updated = 0;
  let images = 0;

  for (const product of products) {
    const categoryId = categoryIds.get(product.categorySlug);
    if (!categoryId) {
      log(`Se omite ${product.name}: categoría desconocida (${product.categorySlug}).`);
      continue;
    }

    const payload = {
      slug: product.slug,
      legacy_anchor: product.anchor,
      name: product.name,
      short_description: product.shortDescription || null,
      description: product.shortDescription || null,
      price: product.price,
      compare_at_price: product.compareAtPrice,
      category_id: categoryId,
      badge: product.badge || null,
      sku: null,
      is_active: true,
      offer_eligible: !product.permanentOffer,
      base_discount: 0,
      sort_order: product.sortOrder,
      seo_title: null,
      seo_description: null
    };

    const { data: existing } = await supabase
      .from("products")
      .select("id,slug")
      .or(`slug.eq.${product.slug},legacy_anchor.eq.${product.anchor}`)
      .limit(1)
      .maybeSingle();

    // Si el producto ya existe (aunque le hayan cambiado el slug), se conserva
    // su slug actual para no romper enlaces, y se actualiza por id.
    const savedPayload = existing ? { ...payload, slug: existing.slug } : payload;

    let saved;
    if (existing) {
      const { data, error } = await supabase
        .from("products")
        .update(savedPayload)
        .eq("id", existing.id)
        .select("id,slug")
        .single();
      if (error) throw error;
      saved = data;
      updated += 1;
    } else {
      const { data, error } = await supabase
        .from("products")
        .insert({ ...savedPayload, legacy_anchor: product.anchor })
        .select("id,slug")
        .single();
      if (error) throw error;
      saved = data;
      created += 1;
    }

    // Imagen principal: solo si el producto aún no tiene una.
    const { count: imageCount, error: imageCountError } = await supabase
      .from("product_images")
      .select("id", { count: "exact", head: true })
      .eq("product_id", saved.id);

    if (imageCountError) throw imageCountError;
    if (imageCount) continue;

    if (!product.imageSrc) {
      log(`Aviso: ${product.name} no tiene imagen en la tienda actual.`);
      continue;
    }

    const fileName = path.basename(product.imageSrc);
    const localPath = path.join(IMAGE_DIR, fileName);
    let filePath = localPath;

    try {
      await fs.access(filePath);
    } catch {
      const webpPath = localPath.replace(/\.(png|jpe?g)$/i, ".webp");
      try {
        await fs.access(webpPath);
        filePath = webpPath;
      } catch {
        log(`Aviso: no se encontró la imagen ${fileName}; se omite.`);
        continue;
      }
    }

    const contentType = filePath.endsWith(".png")
      ? "image/png"
      : filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")
        ? "image/jpeg"
        : "image/webp";

    const uploaded = await uploadImage(supabase, product, filePath, contentType);

    const { error: imageError } = await supabase.from("product_images").insert({
      product_id: saved.id,
      storage_path: uploaded.storagePath,
      thumb_path: null,
      alt: product.imageAlt,
      width: product.imageWidth,
      height: product.imageHeight,
      bytes: uploaded.bytes,
      sort_order: 0,
      is_primary: true
    });

    if (imageError) throw imageError;
    images += 1;
  }

  // Ajustes base (no sobrescribe los que ya existan)
  await supabase.from("settings").upsert(
    [
      {
        key: "store",
        value: {
          name: "Cueva Boutique",
          whatsapp: "18293815317",
          generalLink: "https://wa.me/message/P3LU5C3LG4JPA1",
          instagramHandle: "@cueva_boutique",
          instagramUrl: "https://www.instagram.com/cueva_boutique?mdxt=MTh0ZnBxb3Bta3ZuaA==",
          locale: "es-DO",
          currency: "DOP",
          currencySymbol: "$"
        }
      },
      {
        key: "daily_offers",
        value: {
          enabled: true,
          count: 6,
          step: 0,
          highDiscount: 15,
          highCount: 3,
          lowDiscount: 10,
          startDate: "2026-10-31",
          seed: 484
        }
      }
    ],
    { onConflict: "key", ignoreDuplicates: true }
  );

  // Versión publicada
  const today = new Date().toISOString().slice(0, 10);
  await supabase.from("settings").upsert(
    { key: "site", value: { version: "1.2.0", updatedAt: today } },
    { onConflict: "key" }
  );

  await supabase.from("site_releases").upsert(
    {
      version: "1.2.0",
      notes: "Catálogo inicial migrado al CMS.",
      released_at: new Date().toISOString()
    },
    { onConflict: "version" }
  );

  // Administrador opcional
  let admin = null;
  if (adminEmail && adminPassword) {
    const { data: list, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) throw listError;

    const existingUser = list.users.find(
      (user) => user.email?.toLowerCase() === adminEmail.toLowerCase()
    );

    let userId = existingUser?.id;
    if (!userId) {
      const { data: authUser, error: createError } = await supabase.auth.admin.createUser({
        email: adminEmail,
        password: adminPassword,
        email_confirm: true
      });
      if (createError) throw createError;
      userId = authUser.user.id;
      log(`Administrador creado: ${adminEmail}`);
    } else {
      log(`El administrador ${adminEmail} ya existía.`);
    }

    const { error: profileError } = await supabase.from("admin_profiles").upsert(
      {
        user_id: userId,
        email: adminEmail,
        full_name: adminName || "Administrador",
        is_active: true
      },
      { onConflict: "user_id" }
    );

    if (profileError) throw profileError;
    admin = adminEmail;
  }

  log(
    `Listo: ${created} creados, ${updated} actualizados, ${images} imágenes subidas.` +
      (admin ? ` Admin: ${admin}.` : "")
  );

  return { created, updated, images, admin };
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  seed({
    url: requiredEnv("SUPABASE_URL"),
    key: supabaseKey(),
    adminEmail: String(process.env.ADMIN_EMAIL || "").trim(),
    adminPassword: String(process.env.ADMIN_PASSWORD || "").trim(),
    adminName: String(process.env.ADMIN_NAME || "Administrador").trim()
  }).catch((error) => {
    console.error(`[seed] Error: ${error.message}`);
    process.exitCode = 1;
  });
}
