import type { z } from "zod";
import { getSupabase, publicImageUrl } from "./supabase";
import { AppError } from "./errors";
import { audit, type AdminUser } from "./auth";
import { productSchema, slugify } from "./validation";

type ProductInput = z.infer<typeof productSchema>;

const IMAGE_SELECT =
  "id,storage_path,thumb_path,alt,width,height,bytes,is_primary,sort_order";

// Columnas que realmente usa mapProduct(). Nada de SELECT *.
const PRODUCT_COLUMNS =
  "id,slug,legacy_anchor,name,short_description,description,price,compare_at_price,base_discount,badge,sku,is_active,offer_eligible,sort_order,seo_title,seo_description,created_at,updated_at";

const PRODUCT_SELECT = `${PRODUCT_COLUMNS}, category:categories(id,slug,name), images:product_images(${IMAGE_SELECT})`;

type ProductRow = Record<string, any>;

function mapImage(row: ProductRow) {
  return {
    id: row.id,
    path: row.storage_path,
    thumbPath: row.thumb_path,
    url: publicImageUrl(row.storage_path),
    thumbUrl: publicImageUrl(row.thumb_path) || publicImageUrl(row.storage_path),
    alt: row.alt,
    width: row.width,
    height: row.height,
    bytes: row.bytes,
    isPrimary: Boolean(row.is_primary),
    sortOrder: row.sort_order
  };
}

export function mapProduct(row: ProductRow) {
  const images = Array.isArray(row.images)
    ? row.images
        .map(mapImage)
        .sort((a: any, b: any) => {
          if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
          return (a.sortOrder || 0) - (b.sortOrder || 0);
        })
    : [];

  return {
    id: row.id,
    slug: row.slug,
    anchor: row.legacy_anchor || `product-${row.slug}`,
    name: row.name,
    shortDescription: row.short_description,
    description: row.description,
    price: Number(row.price),
    compareAtPrice:
      row.compare_at_price === null || row.compare_at_price === undefined
        ? null
        : Number(row.compare_at_price),
    baseDiscount: Number(row.base_discount),
    badge: row.badge,
    sku: row.sku,
    isActive: Boolean(row.is_active),
    offerEligible: Boolean(row.offer_eligible),
    sortOrder: Number(row.sort_order),
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    category: row.category
      ? { id: row.category.id, slug: row.category.slug, name: row.category.name }
      : null,
    images,
    image: images[0] || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function assertCategory(categoryId: string): Promise<void> {
  const { data, error } = await getSupabase()
    .from("categories")
    .select("id")
    .eq("id", categoryId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new AppError(422, "INVALID_CATEGORY", "La categoría seleccionada no existe.");
  }
}

async function slugTaken(slug: string, excludeId?: string): Promise<boolean> {
  let query = getSupabase()
    .from("products")
    .select("id")
    .or(`slug.eq.${slug},legacy_anchor.eq.product-${slug}`)
    .limit(1);

  if (excludeId) query = query.neq("id", excludeId);

  const { data, error } = await query;
  if (error) throw error;
  return Boolean(data && data.length);
}

async function uniqueSlug(base: string, excludeId?: string): Promise<string> {
  let candidate = slugify(base);
  let suffix = 2;

  while (await slugTaken(candidate, excludeId)) {
    candidate = `${slugify(base)}-${suffix}`;
    suffix += 1;
    if (suffix > 99) {
      throw new AppError(409, "SLUG_CONFLICT", "No se pudo generar un enlace único.");
    }
  }

  return candidate;
}

function dbPayload(input: ProductInput, slug: string, actorId: string) {
  return {
    name: input.name,
    slug,
    short_description: input.shortDescription || null,
    description: input.description || null,
    price: input.price,
    compare_at_price: input.compareAtPrice ?? null,
    category_id: input.categoryId,
    badge: input.badge || null,
    sku: input.sku || null,
    is_active: input.isActive,
    offer_eligible: input.offerEligible,
    base_discount: input.baseDiscount,
    sort_order: input.sortOrder,
    seo_title: input.seoTitle || null,
    seo_description: input.seoDescription || null,
    updated_by: actorId
  };
}

export async function listProducts(input: {
  q?: string;
  category?: string;
  status?: string;
  page?: number;
  limit?: number;
}) {
  const page = Math.max(1, input.page || 1);
  const limit = Math.min(100, Math.max(1, input.limit || 30));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = getSupabase()
    .from("products")
    .select(PRODUCT_SELECT, { count: "exact" });

  if (input.q) {
    const safe = String(input.q).replace(/[,()%]/g, " ").trim();
    if (safe) query = query.or(`name.ilike.%${safe}%,slug.ilike.%${safe}%`);
  }

  if (input.category) query = query.eq("category_id", input.category);
  if (input.status === "active") query = query.eq("is_active", true);
  if (input.status === "inactive") query = query.eq("is_active", false);

  const { data, error, count } = await query
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })
    .range(from, to);

  if (error) throw error;

  return {
    items: (data || []).map(mapProduct),
    total: count || 0,
    page,
    limit
  };
}

export async function getProduct(id: string) {
  const { data, error } = await getSupabase()
    .from("products")
    .select(PRODUCT_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new AppError(404, "NOT_FOUND", "El producto no existe.");
  return mapProduct(data);
}

export async function createProduct(input: ProductInput, actor: AdminUser) {
  await assertCategory(input.categoryId);

  const base = input.slug ? input.slug : input.name;
  const slug = await uniqueSlug(base);
  const payload = dbPayload(input, slug, actor.id);

  const { data, error } = await getSupabase()
    .from("products")
    .insert({ ...payload, legacy_anchor: `product-${slug}`, created_by: actor.id })
    .select(PRODUCT_SELECT)
    .single();

  if (error) throw error;

  await audit({
    actor,
    action: "product.create",
    entity: "product",
    entityId: data.id,
    diff: { after: mapProduct(data) }
  });

  return mapProduct(data);
}

export async function updateProduct(id: string, input: ProductInput, actor: AdminUser) {
  const current = await getProduct(id);
  await assertCategory(input.categoryId);

  let slug = current.slug;
  if (input.slug && slugify(input.slug) !== current.slug) {
    slug = await uniqueSlug(input.slug, id);
  }

  const payload = dbPayload(input, slug, actor.id);
  const { data, error } = await getSupabase()
    .from("products")
    .update(payload)
    .eq("id", id)
    .select(PRODUCT_SELECT)
    .single();

  if (error) throw error;

  await audit({
    actor,
    action: "product.update",
    entity: "product",
    entityId: id,
    diff: { before: current, after: mapProduct(data) }
  });

  return mapProduct(data);
}

export async function deleteProduct(id: string, actor: AdminUser) {
  const current = await getProduct(id);
  const paths = current.images.flatMap((image: any) =>
    [image.path, image.thumbPath].filter(Boolean)
  );

  if (paths.length) {
    await getSupabase().storage.from("product-images").remove(paths);
  }

  const { error } = await getSupabase().from("products").delete().eq("id", id);
  if (error) throw error;

  await audit({
    actor,
    action: "product.delete",
    entity: "product",
    entityId: id,
    diff: { before: current }
  });

  return { id };
}

export async function touchProduct(id: string, actorId?: string) {
  const payload: Record<string, unknown> = {};
  if (actorId) payload.updated_by = actorId;
  await getSupabase().from("products").update(payload).eq("id", id);
}

export async function productCounts() {
  const { data, error } = await getSupabase()
    .from("products")
    .select(
      "id,is_active,price,category_id,base_discount,compare_at_price,offer_eligible,updated_at"
    )
    .limit(5000);

  if (error) throw error;
  return data || [];
}
