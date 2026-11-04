import { z } from "zod";

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(value: string): string {
  const slug = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return slug || "producto";
}

export const loginSchema = z.object({
  email: z.string().trim().email().max(160),
  password: z.string().min(6).max(200)
});

export const passwordSchema = z.object({
  currentPassword: z.string().min(6).max(200),
  newPassword: z.string().min(8).max(200)
});

export const productBaseSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().max(80).optional().nullable(),
  shortDescription: z.string().trim().max(300).optional().nullable(),
  description: z.string().trim().max(5000).optional().nullable(),
  price: z.coerce.number().min(0).max(1000000),
  compareAtPrice: z.coerce.number().min(0).max(1000000).optional().nullable(),
  categoryId: z.string().uuid(),
  badge: z.string().trim().max(40).optional().nullable(),
  sku: z.string().trim().max(60).optional().nullable(),
  isActive: z.boolean().default(true),
  offerEligible: z.boolean().default(true),
  baseDiscount: z.coerce.number().int().min(0).max(90).default(0),
  sortOrder: z.coerce.number().int().min(-9999).max(9999).default(0),
  seoTitle: z.string().trim().max(70).optional().nullable(),
  seoDescription: z.string().trim().max(160).optional().nullable()
});

export const productSchema = productBaseSchema.refine(
  (value) => value.compareAtPrice == null || value.compareAtPrice > value.price,
  {
    message: "El precio anterior debe ser mayor que el precio actual.",
    path: ["compareAtPrice"]
  }
);

export const categorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  slug: z.string().trim().max(60).optional().nullable(),
  description: z.string().trim().max(300).optional().nullable(),
  sortOrder: z.coerce.number().int().min(-9999).max(9999).default(0),
  isActive: z.boolean().default(true)
});

export const imageSignSchema = z.object({
  contentType: z.enum(["image/webp", "image/jpeg", "image/png"]),
  bytes: z.coerce.number().int().positive().max(5 * 1024 * 1024),
  kind: z.enum(["full", "thumb"]).default("full")
});

export const imageRegisterSchema = z.object({
  path: z.string().min(3).max(300),
  thumbPath: z.string().min(3).max(300).optional().nullable(),
  alt: z.string().trim().max(160).optional().nullable(),
  width: z.coerce.number().int().positive().max(8000).optional().nullable(),
  height: z.coerce.number().int().positive().max(8000).optional().nullable(),
  bytes: z.coerce.number().int().positive().max(5 * 1024 * 1024).optional().nullable(),
  isPrimary: z.boolean().default(false)
});

export const imageOrderSchema = z.object({
  imageIds: z.array(z.string().uuid()).min(1).max(8)
});

export const releaseSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "Usa el formato 1.2.0"),
  notes: z.string().trim().max(500).optional().nullable()
});

export const settingsSchema = z.object({
  store: z
    .object({
      name: z.string().trim().min(2).max(80),
      whatsapp: z.string().trim().max(20),
      generalLink: z.string().trim().max(300),
      instagramHandle: z.string().trim().max(80),
      instagramUrl: z.string().trim().max(300),
      locale: z.string().trim().max(20),
      currency: z.string().trim().max(10),
      currencySymbol: z.string().trim().max(5)
    })
    .partial()
    .optional(),
  dailyOffers: z
    .object({
      enabled: z.boolean(),
      count: z.coerce.number().int().min(1).max(12),
      step: z.coerce.number().int().min(0).max(50),
      highDiscount: z.coerce.number().int().min(0).max(90),
      highCount: z.coerce.number().int().min(0).max(12),
      lowDiscount: z.coerce.number().int().min(0).max(90),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      seed: z.coerce.number().int().min(1).max(999999)
    })
    .partial()
    .optional(),
  site: z
    .object({
      version: z.string().regex(/^\d+\.\d+\.\d+$/),
      updatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
    })
    .partial()
    .optional()
});
