import crypto from "node:crypto";
import type { z } from "zod";
import { getSupabase, publicImageUrl } from "./supabase";
import { AppError } from "./errors";
import { audit, type AdminUser } from "./auth";
import { getProduct, touchProduct } from "./products";
import type { imageRegisterSchema, imageSignSchema } from "./validation";

type SignInput = z.infer<typeof imageSignSchema>;
type RegisterInput = z.infer<typeof imageRegisterSchema>;

const EXTENSIONS: Record<string, string> = {
  "image/webp": "webp",
  "image/jpeg": "jpg",
  "image/png": "png"
};

const MAX_IMAGES = 8;

function storagePathPrefix(slug: string): string {
  return `products/${slug}/`;
}

function mapImageRow(data: Record<string, any>) {
  return {
    id: data.id,
    path: data.storage_path,
    thumbPath: data.thumb_path,
    url: publicImageUrl(data.storage_path),
    thumbUrl: publicImageUrl(data.thumb_path) || publicImageUrl(data.storage_path),
    alt: data.alt,
    width: data.width,
    height: data.height,
    bytes: data.bytes,
    isPrimary: Boolean(data.is_primary),
    sortOrder: data.sort_order
  };
}

export async function signImageUpload(
  productId: string,
  input: SignInput,
  actor: AdminUser
) {
  const product = await getProduct(productId);
  const extension = EXTENSIONS[input.contentType] || "webp";
  const path = `${storagePathPrefix(product.slug)}${crypto.randomUUID()}-${input.kind}.${extension}`;

  const { data, error } = await getSupabase()
    .storage.from("product-images")
    .createSignedUploadUrl(path);

  if (error) throw error;

  await audit({
    actor,
    action: "image.sign",
    entity: "product",
    entityId: productId,
    diff: { path }
  });

  return {
    path,
    token: data.token,
    signedUrl: data.signedUrl,
    publicUrl: publicImageUrl(path)
  };
}

export async function registerImage(
  productId: string,
  input: RegisterInput,
  actor: AdminUser
) {
  const product = await getProduct(productId);
  const prefix = storagePathPrefix(product.slug);

  if (product.images.length >= MAX_IMAGES) {
    throw new AppError(
      422,
      "IMAGE_LIMIT",
      `Cada producto admite hasta ${MAX_IMAGES} fotos. Elimina una para agregar otra.`
    );
  }

  if (!input.path.startsWith(prefix)) {
    throw new AppError(422, "INVALID_PATH", "La ruta de la imagen no corresponde al producto.");
  }
  if (input.thumbPath && !input.thumbPath.startsWith(prefix)) {
    throw new AppError(422, "INVALID_PATH", "La ruta de la miniatura no corresponde al producto.");
  }

  const makePrimary = Boolean(input.isPrimary) || product.images.length === 0;
  const nextSortOrder = product.images.reduce(
    (max: number, image: any) => Math.max(max, Number(image.sortOrder) || 0),
    -1
  ) + 1;
  const supabase = getSupabase();

  if (makePrimary && product.images.length > 0) {
    const { error: resetError } = await supabase
      .from("product_images")
      .update({ is_primary: false })
      .eq("product_id", productId)
      .eq("is_primary", true);
    if (resetError) throw resetError;
  }

  const { data, error } = await supabase
    .from("product_images")
    .insert({
      product_id: productId,
      storage_path: input.path,
      thumb_path: input.thumbPath || null,
      alt: input.alt || product.name,
      width: input.width ?? null,
      height: input.height ?? null,
      bytes: input.bytes ?? null,
      sort_order: nextSortOrder,
      is_primary: makePrimary
    })
    .select("*")
    .single();

  if (error) {
    // Si falló la inserción, intenta devolver la principal anterior.
    if (makePrimary && product.images[0]) {
      await supabase
        .from("product_images")
        .update({ is_primary: true })
        .eq("id", product.images[0].id);
    }
    throw error;
  }

  await touchProduct(productId, actor.id);

  await audit({
    actor,
    action: "image.register",
    entity: "product",
    entityId: productId,
    diff: { image: data }
  });

  return mapImageRow(data);
}

export async function reorderImages(
  productId: string,
  imageIds: string[],
  actor: AdminUser
) {
  const product = await getProduct(productId);
  const known = new Set(product.images.map((image: any) => image.id));
  const unique = Array.from(new Set(imageIds));

  if (unique.length !== product.images.length) {
    throw new AppError(
      422,
      "INVALID_ORDER",
      "El orden debe incluir todas las fotos del producto, sin repetirlas."
    );
  }

  for (const id of unique) {
    if (!known.has(id)) {
      throw new AppError(422, "INVALID_ORDER", "Una de las fotos no pertenece al producto.");
    }
  }

  const supabase = getSupabase();
  for (let index = 0; index < unique.length; index += 1) {
    const { error } = await supabase
      .from("product_images")
      .update({ sort_order: index })
      .eq("id", unique[index])
      .eq("product_id", productId);
    if (error) throw error;
  }

  await touchProduct(productId, actor.id);
  await audit({
    actor,
    action: "image.reorder",
    entity: "product",
    entityId: productId,
    diff: { order: unique }
  });

  return { order: unique };
}

export async function updateImage(
  productId: string,
  imageId: string,
  input: { alt?: string | null; isPrimary?: boolean },
  actor: AdminUser
) {
  const { data: image, error: readError } = await getSupabase()
    .from("product_images")
    .select("*")
    .eq("id", imageId)
    .eq("product_id", productId)
    .maybeSingle();

  if (readError) throw readError;
  if (!image) throw new AppError(404, "NOT_FOUND", "La imagen no existe.");

  if (input.isPrimary === true) {
    const { error: resetError } = await getSupabase()
      .from("product_images")
      .update({ is_primary: false })
      .eq("product_id", productId)
      .eq("is_primary", true);
    if (resetError) throw resetError;
  }

  const { data, error } = await getSupabase()
    .from("product_images")
    .update({
      alt: input.alt ?? image.alt,
      is_primary: input.isPrimary === true ? true : Boolean(image.is_primary)
    })
    .eq("id", imageId)
    .select("*")
    .single();

  if (error) throw error;

  await touchProduct(productId, actor.id);
  await audit({
    actor,
    action: "image.update",
    entity: "product",
    entityId: productId,
    diff: { before: image, after: data }
  });

  return mapImageRow(data);
}

export async function deleteImage(
  productId: string,
  imageId: string,
  actor: AdminUser
) {
  const { data: image, error: readError } = await getSupabase()
    .from("product_images")
    .select("*")
    .eq("id", imageId)
    .eq("product_id", productId)
    .maybeSingle();

  if (readError) throw readError;
  if (!image) throw new AppError(404, "NOT_FOUND", "La imagen no existe.");

  const paths = [image.storage_path, image.thumb_path].filter(Boolean) as string[];
  if (paths.length) {
    await getSupabase().storage.from("product-images").remove(Array.from(new Set(paths)));
  }

  const { error } = await getSupabase().from("product_images").delete().eq("id", imageId);
  if (error) throw error;

  if (image.is_primary) {
    const { data: next } = await getSupabase()
      .from("product_images")
      .select("id")
      .eq("product_id", productId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (next) {
      await getSupabase()
        .from("product_images")
        .update({ is_primary: true })
        .eq("id", next.id);
    }
  }

  await touchProduct(productId, actor.id);
  await audit({
    actor,
    action: "image.delete",
    entity: "product",
    entityId: productId,
    diff: { before: image }
  });

  return { id: imageId };
}
