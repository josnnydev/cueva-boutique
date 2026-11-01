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

function storagePathPrefix(slug: string): string {
  return `products/${slug}/`;
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

  if (!input.path.startsWith(prefix)) {
    throw new AppError(422, "INVALID_PATH", "La ruta de la imagen no corresponde al producto.");
  }
  if (input.thumbPath && !input.thumbPath.startsWith(prefix)) {
    throw new AppError(422, "INVALID_PATH", "La ruta de la miniatura no corresponde al producto.");
  }

  const makePrimary = Boolean(input.isPrimary) || product.images.length === 0;
  const supabase = getSupabase();

  let previousPrimary: any[] = [];
  if (makePrimary) {
    const { data: previous, error: previousError } = await supabase
      .from("product_images")
      .select("id,storage_path,thumb_path")
      .eq("product_id", productId)
      .eq("is_primary", true);

    if (previousError) throw previousError;
    previousPrimary = previous || [];

    if (previousPrimary.length) {
      const { error: resetError } = await supabase
        .from("product_images")
        .update({ is_primary: false })
        .eq("product_id", productId)
        .eq("is_primary", true);
      if (resetError) throw resetError;
    }
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
      sort_order: product.images.length,
      is_primary: makePrimary
    })
    .select("*")
    .single();

  if (error) {
    // Si falló la inserción, intenta devolver la principal anterior.
    if (previousPrimary.length) {
      await supabase
        .from("product_images")
        .update({ is_primary: true })
        .eq("id", previousPrimary[0].id);
    }
    throw error;
  }

  if (previousPrimary.length) {
    const oldPaths = previousPrimary.flatMap((image) =>
      [image.storage_path, image.thumb_path].filter(Boolean)
    );
    if (oldPaths.length) {
      await supabase.storage.from("product-images").remove(Array.from(new Set(oldPaths)));
    }
    await supabase
      .from("product_images")
      .delete()
      .in(
        "id",
        previousPrimary.map((image) => image.id)
      );
  }

  await touchProduct(productId, actor.id);

  await audit({
    actor,
    action: "image.register",
    entity: "product",
    entityId: productId,
    diff: { image: data }
  });

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
    isPrimary: data.is_primary
  };
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

  if (input.isPrimary) {
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
      is_primary: input.isPrimary ?? image.is_primary
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

  return data;
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
