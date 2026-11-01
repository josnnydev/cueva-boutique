import { getSupabase } from "./supabase";
import { AppError } from "./errors";
import { audit, type AdminUser } from "./auth";
import { slugify } from "./validation";

type CategoryInput = {
  name: string;
  slug?: string | null;
  description?: string | null;
  sortOrder: number;
  isActive: boolean;
};

async function categorySlugTaken(slug: string, excludeId?: string): Promise<boolean> {
  let query = getSupabase().from("categories").select("id").eq("slug", slug).limit(1);
  if (excludeId) query = query.neq("id", excludeId);
  const { data, error } = await query;
  if (error) throw error;
  return Boolean(data && data.length);
}

async function uniqueCategorySlug(base: string, excludeId?: string): Promise<string> {
  let candidate = slugify(base);
  let suffix = 2;
  while (await categorySlugTaken(candidate, excludeId)) {
    candidate = `${slugify(base)}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

export async function listCategories() {
  const { data, error } = await getSupabase()
    .from("categories")
    .select("*, products(count)")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;

  return (data || []).map((row: any) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    productCount: Number(row.products?.[0]?.count || 0)
  }));
}

export async function createCategory(input: CategoryInput, actor: AdminUser) {
  const slug = await uniqueCategorySlug(input.slug || input.name);

  const { data, error } = await getSupabase()
    .from("categories")
    .insert({
      name: input.name,
      slug,
      description: input.description || null,
      sort_order: input.sortOrder,
      is_active: input.isActive
    })
    .select("*")
    .single();

  if (error) throw error;

  await audit({
    actor,
    action: "category.create",
    entity: "category",
    entityId: data.id,
    diff: { after: data }
  });

  return data;
}

export async function updateCategory(
  id: string,
  input: CategoryInput,
  actor: AdminUser
) {
  const { data: current, error: readError } = await getSupabase()
    .from("categories")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (readError) throw readError;
  if (!current) throw new AppError(404, "NOT_FOUND", "La categoría no existe.");

  let slug = current.slug;
  if (input.slug && slugify(input.slug) !== current.slug) {
    slug = await uniqueCategorySlug(input.slug, id);
  }

  const { data, error } = await getSupabase()
    .from("categories")
    .update({
      name: input.name,
      slug,
      description: input.description || null,
      sort_order: input.sortOrder,
      is_active: input.isActive
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;

  await audit({
    actor,
    action: "category.update",
    entity: "category",
    entityId: id,
    diff: { before: current, after: data }
  });

  return data;
}

export async function deleteCategory(id: string, actor: AdminUser) {
  const { count, error: countError } = await getSupabase()
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("category_id", id);

  if (countError) throw countError;
  if ((count || 0) > 0) {
    throw new AppError(
      409,
      "CATEGORY_IN_USE",
      "No puedes eliminar una categoría que tiene productos. Muévelos primero."
    );
  }

  const { data: current, error: readError } = await getSupabase()
    .from("categories")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (readError) throw readError;
  if (!current) throw new AppError(404, "NOT_FOUND", "La categoría no existe.");

  const { error } = await getSupabase().from("categories").delete().eq("id", id);
  if (error) throw error;

  await audit({
    actor,
    action: "category.delete",
    entity: "category",
    entityId: id,
    diff: { before: current }
  });

  return { id };
}
