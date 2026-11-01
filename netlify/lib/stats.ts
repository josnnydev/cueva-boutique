import { getSupabase } from "./supabase";

export async function getStats() {
  const supabase = getSupabase();

  const [productsResult, categoriesResult, imagesResult, releasesResult, auditResult] =
    await Promise.all([
      supabase
        .from("products")
        .select(
          "id,is_active,price,category_id,base_discount,compare_at_price,offer_eligible,updated_at,images:product_images(id)"
        ),
      supabase.from("categories").select("id,slug,name").order("sort_order"),
      supabase.from("product_images").select("bytes"),
      supabase
        .from("site_releases")
        .select("version,notes,released_at")
        .order("released_at", { ascending: false })
        .limit(1),
      supabase
        .from("audit_log")
        .select("id,action,entity,entity_id,actor_email,created_at")
        .order("created_at", { ascending: false })
        .limit(8)
    ]);

  if (productsResult.error) throw productsResult.error;
  if (categoriesResult.error) throw categoriesResult.error;
  if (imagesResult.error) throw imagesResult.error;
  if (releasesResult.error) throw releasesResult.error;
  if (auditResult.error) throw auditResult.error;

  const products = productsResult.data || [];
  const active = products.filter((product: any) => product.is_active);
  const catalogValue = active.reduce((sum: number, product: any) => sum + Number(product.price), 0);
  const averagePrice = active.length ? catalogValue / active.length : 0;
  const withDiscount = active.filter(
    (product: any) =>
      Number(product.base_discount) > 0 ||
      (product.compare_at_price !== null && Number(product.compare_at_price) > Number(product.price))
  ).length;
  const offerEligible = active.filter((product: any) => product.offer_eligible).length;
  const withoutImage = active.filter(
    (product: any) => !Array.isArray(product.images) || product.images.length === 0
  ).length;
  const updatedLast7Days = products.filter(
    (product: any) =>
      new Date(product.updated_at).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000
  ).length;

  const byCategory = new Map<string, number>();
  for (const product of active) {
    byCategory.set(product.category_id, (byCategory.get(product.category_id) || 0) + 1);
  }

  const categories = (categoriesResult.data || []).map((category) => ({
    id: category.id,
    slug: category.slug,
    name: category.name,
    count: byCategory.get(category.id) || 0
  }));

  const imageBytes = (imagesResult.data || []).reduce(
    (sum: number, image: any) => sum + Number(image.bytes || 0),
    0
  );

  return {
    products: {
      total: products.length,
      active: active.length,
      inactive: products.length - active.length,
      withoutImage,
      updatedLast7Days
    },
    categories,
    prices: {
      catalogValue,
      averagePrice,
      min: active.length ? Math.min(...active.map((product: any) => Number(product.price))) : 0,
      max: active.length ? Math.max(...active.map((product: any) => Number(product.price))) : 0
    },
    offers: {
      withDiscount,
      eligible: offerEligible
    },
    storage: {
      images: (imagesResult.data || []).length,
      bytes: imageBytes
    },
    lastRelease: (releasesResult.data || [])[0] || null,
    recentActivity: auditResult.data || []
  };
}
