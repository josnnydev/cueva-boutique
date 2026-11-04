import crypto from "node:crypto";
import { getSupabase, publicImageUrl } from "./supabase";

export type CatalogProduct = {
  id: string;
  slug: string;
  anchor: string;
  name: string;
  shortDescription: string | null;
  description: string | null;
  price: number;
  compareAtPrice: number | null;
  baseDiscount: number;
  badge: string | null;
  offerEligible: boolean;
  soldOut: boolean;
  sortOrder: number;
  updatedAt: string;
  category: { id: string; slug: string; name: string; sortOrder: number };
  image: {
    src: string;
    thumb: string;
    alt: string;
    width: number | null;
    height: number | null;
  } | null;
  images: Array<{
    src: string;
    thumb: string;
    alt: string;
    width: number | null;
    height: number | null;
  }>;
};

export type PublicCatalog = {
  site: {
    name: string;
    version: string;
    updatedAt: string;
    whatsapp: string;
    generalLink: string;
    instagramHandle: string;
    instagramUrl: string;
    locale: string;
    currency: string;
    currencySymbol: string;
  };
  dailyOffers: Record<string, unknown>;
  categories: Array<{ id: string; slug: string; name: string; count: number }>;
  products: CatalogProduct[];
  generatedAt: string;
};

function number(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function settingObject(
  rows: Array<{ key: string; value: unknown }> | null | undefined,
  key: string
): Record<string, unknown> {
  const row = (rows || []).find((item) => item.key === key);
  return row && row.value && typeof row.value === "object"
    ? (row.value as Record<string, unknown>)
    : {};
}

export async function buildCatalog(): Promise<PublicCatalog> {
  const supabase = getSupabase();

  const [productsResult, categoriesResult, settingsResult, imagesResult] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, slug, legacy_anchor, name, short_description, description, price, compare_at_price, base_discount, badge, offer_eligible, sort_order, updated_at, is_active, category:categories(id, slug, name, sort_order, is_active)"
      )
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("categories")
      .select("id, slug, name, sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase.from("settings").select("key, value").in("key", ["store", "daily_offers", "site"]),
    supabase
      .from("product_images")
      .select("product_id, storage_path, thumb_path, alt, width, height, is_primary, sort_order")
      .order("is_primary", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
  ]);

  if (productsResult.error) throw productsResult.error;
  if (categoriesResult.error) throw categoriesResult.error;
  if (settingsResult.error) throw settingsResult.error;
  if (imagesResult.error) throw imagesResult.error;

  const galleryByProduct = new Map<string, Array<Record<string, unknown>>>();
  for (const image of imagesResult.data || []) {
    const list = galleryByProduct.get(image.product_id) || [];
    list.push(image);
    galleryByProduct.set(image.product_id, list);
  }

  const activeCategories = new Set((categoriesResult.data || []).map((row) => row.slug));

  const productRows = (productsResult.data || [])
    .filter((row: any) => row.category && activeCategories.has(row.category.slug))
    .sort((a: any, b: any) => {
      const categoryOrder = number(a.category.sort_order) - number(b.category.sort_order);
      if (categoryOrder !== 0) return categoryOrder;
      const sortOrder = number(a.sort_order) - number(b.sort_order);
      if (sortOrder !== 0) return sortOrder;
      return String(a.name).localeCompare(String(b.name), "es");
    });

  const store = settingObject(settingsResult.data, "store");
  const site = settingObject(settingsResult.data, "site");
  const dailyOffers = settingObject(settingsResult.data, "daily_offers");

  const counts = new Map<string, number>();
  for (const row of productRows) {
    const slug = String((row as any).category.slug);
    counts.set(slug, (counts.get(slug) || 0) + 1);
  }

  const categories = (categoriesResult.data || []).map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    count: counts.get(row.slug) || 0
  }));

  const products: CatalogProduct[] = productRows.map((row: any) => {
    const gallery = (galleryByProduct.get(row.id) || [])
      .map((image) => {
        const imageSrc = publicImageUrl(image.storage_path as string) || "";
        const imageThumb = publicImageUrl(image.thumb_path as string) || imageSrc;
        return {
          src: imageSrc,
          thumb: imageThumb,
          alt: String(image.alt || row.name),
          width: (image.width as number | null) ?? null,
          height: (image.height as number | null) ?? null
        };
      })
      .filter((image) => Boolean(image.src));

    return {
      id: row.id,
      slug: row.slug,
      anchor: row.legacy_anchor || `product-${row.slug}`,
      name: row.name,
      shortDescription: row.short_description,
      description: row.description,
      price: number(row.price),
      compareAtPrice:
        row.compare_at_price === null || row.compare_at_price === undefined
          ? null
          : number(row.compare_at_price),
      baseDiscount: number(row.base_discount),
      badge: row.badge,
      offerEligible: Boolean(row.offer_eligible),
      soldOut: row.is_active === false,
      sortOrder: number(row.sort_order),
      updatedAt: row.updated_at,
      category: {
        id: row.category.id,
        slug: row.category.slug,
        name: row.category.name,
        sortOrder: number(row.category.sort_order)
      },
      image: gallery[0] || null,
      images: gallery
    };
  });

  return {
    site: {
      name: String(store.name || "Cueva Boutique"),
      version: String(site.version || "1.3.0"),
      updatedAt: String(site.updatedAt || ""),
      whatsapp: String(store.whatsapp || ""),
      generalLink: String(store.generalLink || ""),
      instagramHandle: String(store.instagramHandle || ""),
      instagramUrl: String(store.instagramUrl || ""),
      locale: String(store.locale || "es-DO"),
      currency: String(store.currency || "DOP"),
      currencySymbol: String(store.currencySymbol || "$")
    },
    dailyOffers,
    categories,
    products,
    generatedAt: new Date().toISOString()
  };
}

export function catalogEtag(catalog: PublicCatalog): string {
  // generatedAt cambia en cada petición: no debe alterar el ETag.
  const { generatedAt: _generatedAt, ...stable } = catalog;
  return crypto
    .createHash("sha1")
    .update(JSON.stringify(stable))
    .digest("hex")
    .slice(0, 24);
}

export function publicCatalogHeaders(etag: string): Record<string, string> {
  return {
    ETag: `"${etag}"`,
    // El navegador revalida; el CDN de Netlify sirve la versión cacheada 30 s.
    "Cache-Control": "public, max-age=0, must-revalidate",
    "Netlify-CDN-Cache-Control": "public, s-maxage=30, stale-while-revalidate=300",
    Vary: "Accept-Encoding"
  };
}
