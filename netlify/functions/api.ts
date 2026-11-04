import type { Handler, HandlerEvent } from "@netlify/functions";
import { ZodError } from "zod";
import { env, missingEnv } from "../lib/env";
import {
  corsHeaders,
  fail,
  getHeader,
  isMutation,
  json,
  ok,
  parseBody,
  requestIp,
  sameOrigin
} from "../lib/http";
import { AppError, isAppError } from "../lib/errors";
import {
  audit,
  getAdmin,
  hashValue,
  recordAttempt,
  tooManyAttempts,
  type AdminUser
} from "../lib/auth";
import {
  clearSessionCookie,
  sessionCookie,
  signSession
} from "../lib/session";
import { createAuthClient, getSupabase } from "../lib/supabase";
import {
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  updateProduct
} from "../lib/products";
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory
} from "../lib/categories";
import {
  deleteImage,
  registerImage,
  reorderImages,
  signImageUpload,
  updateImage
} from "../lib/images";
import { getStats } from "../lib/stats";
import {
  getSettings,
  listReleases,
  publishRelease,
  triggerBuild,
  updateSettings
} from "../lib/settings";
import { buildCatalog, catalogEtag, publicCatalogHeaders } from "../lib/catalog";
import {
  categorySchema,
  imageOrderSchema,
  imageRegisterSchema,
  imageSignSchema,
  loginSchema,
  passwordSchema,
  productSchema,
  releaseSchema,
  settingsSchema
} from "../lib/validation";

function requestPath(event: HandlerEvent): string {
  let path = "";
  try {
    path = new URL(event.rawUrl).pathname;
  } catch {
    path = event.path || "/";
  }

  path = path.replace(/^\/\.netlify\/functions\/api/, "");
  path = path.replace(/^\/api/, "");
  if (!path) path = "/";
  return path.replace(/\/+$/, "") || "/";
}

function query(event: HandlerEvent) {
  try {
    return new URL(event.rawUrl).searchParams;
  } catch {
    return new URLSearchParams();
  }
}

function assertMutationAllowed(event: HandlerEvent): void {
  if (!isMutation(event.httpMethod)) return;
  if (!sameOrigin(event)) {
    throw new AppError(403, "ORIGIN_NOT_ALLOWED", "Origen no permitido.");
  }
  if (getHeader(event, "x-cb-request") !== "1") {
    throw new AppError(403, "CSRF_CHECK", "Falta la cabecera de seguridad.");
  }
}

async function requireAdmin(event: HandlerEvent): Promise<AdminUser> {
  const admin = await getAdmin(event);
  if (!admin) {
    throw new AppError(401, "UNAUTHORIZED", "Tu sesión expiró. Vuelve a iniciar sesión.");
  }
  return admin;
}

/**
 * Regenera la tienda estática (SEO, JSON-LD, sitemap) sin bloquear la edición:
 * la API ya refleja el cambio al instante y el build se limita a 1 cada 10 min.
 */
async function rebuildStore(admin: AdminUser, force = false): Promise<void> {
  try {
    await triggerBuild(admin, { force });
  } catch (error) {
    console.error("[api] No se pudo iniciar el build:", error);
  }
}

function errorResponse(error: unknown) {
  if (error instanceof SyntaxError) {
    return fail(400, "INVALID_JSON", "El cuerpo de la solicitud no es JSON válido.");
  }

  if (error instanceof ZodError) {
    return fail(
      422,
      "VALIDATION_ERROR",
      "Revisa los datos del formulario.",
      error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }))
    );
  }

  if (isAppError(error)) {
    return fail(error.status, error.code, error.message, error.details);
  }

  const anyError = error as any;
  if (anyError?.code === "23505") {
    return fail(
      409,
      "CONFLICT",
      "Ya existe un registro con ese valor único (enlace, SKU o versión)."
    );
  }
  if (anyError?.code === "23503") {
    return fail(
      409,
      "CONFLICT",
      "No se puede completar la operación porque hay registros relacionados."
    );
  }

  console.error("[api]", error);
  return fail(500, "INTERNAL", "Ocurrió un error inesperado. Inténtalo de nuevo.");
}

function uuidMatch(path: string, pattern: RegExp): string | null {
  const match = path.match(pattern);
  return match ? match[1] : null;
}

export const handler: Handler = async (event) => {
  const method = event.httpMethod.toUpperCase();
  const path = requestPath(event);
  const params = query(event);

  if (method === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        ...corsHeaders(event),
        "Access-Control-Max-Age": "86400"
      },
      body: ""
    };
  }

  try {
    // ------------------------------------------------------------------
    // Salud pública
    // ------------------------------------------------------------------
    if (path === "/health" && method === "GET") {
      return ok({
        configured: env.configured,
        missing: missingEnv(),
        time: new Date().toISOString()
      });
    }

    // ------------------------------------------------------------------
    // Catálogo público (tienda)
    // ------------------------------------------------------------------
    if (path === "/public/catalog" && method === "GET") {
      const catalog = await buildCatalog();
      const etag = catalogEtag(catalog);
      const headers = {
        ...publicCatalogHeaders(etag),
        "Access-Control-Allow-Origin": "*"
      };

      if (getHeader(event, "if-none-match") === `"${etag}"`) {
        return { statusCode: 304, headers, body: "" };
      }

      return json(200, { ok: true, data: catalog, error: null }, headers);
    }

    // ------------------------------------------------------------------
    // Autenticación
    // ------------------------------------------------------------------
    if (path === "/auth/login" && method === "POST") {
      assertMutationAllowed(event);
      const input = loginSchema.parse(parseBody(event));
      const ipHash = hashValue(requestIp(event));

      if (await tooManyAttempts(input.email, ipHash)) {
        return fail(
          429,
          "RATE_LIMITED",
          "Demasiados intentos. Espera 15 minutos antes de volver a probar."
        );
      }

      const supabase = getSupabase();
      const authClient = createAuthClient();
      const { data, error } = await authClient.auth.signInWithPassword({
        email: input.email,
        password: input.password
      });

      if (error || !data.user) {
        await recordAttempt(input.email, ipHash, false);
        return fail(401, "INVALID_CREDENTIALS", "Correo o contraseña incorrectos.");
      }

      const { data: profile, error: profileError } = await supabase
        .from("admin_profiles")
        .select("user_id,email,full_name,is_active,session_version")
        .eq("user_id", data.user.id)
        .maybeSingle();

      if (profileError || !profile || !profile.is_active) {
        await recordAttempt(input.email, ipHash, false);
        return fail(
          403,
          "ACCOUNT_DISABLED",
          "Esta cuenta no tiene acceso al panel. Contacta al administrador."
        );
      }

      await recordAttempt(input.email, ipHash, true);
      await supabase
        .from("admin_profiles")
        .update({ last_login_at: new Date().toISOString() })
        .eq("user_id", data.user.id);

      const actor: AdminUser = {
        id: profile.user_id,
        email: profile.email,
        fullName: profile.full_name,
        sessionVersion: Number(profile.session_version)
      };

      const token = signSession({
        sub: actor.id,
        email: actor.email,
        sv: actor.sessionVersion
      });

      await audit({
        actor,
        action: "auth.login",
        entity: "auth",
        entityId: actor.id,
        ipHash
      });

      return ok(
        {
          user: {
            id: actor.id,
            email: actor.email,
            fullName: actor.fullName
          }
        },
        { "Set-Cookie": sessionCookie(token) }
      );
    }

    if (path === "/auth/logout" && method === "POST") {
      assertMutationAllowed(event);
      const admin = await getAdmin(event);
      if (admin) {
        await audit({ actor: admin, action: "auth.logout", entity: "auth", entityId: admin.id });
      }
      return ok({ loggedOut: true }, { "Set-Cookie": clearSessionCookie() });
    }

    if (path === "/auth/me" && method === "GET") {
      const admin = await requireAdmin(event);
      return ok({
        user: {
          id: admin.id,
          email: admin.email,
          fullName: admin.fullName
        }
      });
    }

    if (path === "/auth/password" && method === "POST") {
      assertMutationAllowed(event);
      const admin = await requireAdmin(event);
      const input = passwordSchema.parse(parseBody(event));
      const supabase = getSupabase();
      const authClient = createAuthClient();

      const { error: verifyError } = await authClient.auth.signInWithPassword({
        email: admin.email,
        password: input.currentPassword
      });

      if (verifyError) {
        return fail(401, "INVALID_PASSWORD", "La contraseña actual no es correcta.");
      }

      const { error: updateError } = await supabase.auth.admin.updateUserById(admin.id, {
        password: input.newPassword
      });

      if (updateError) throw updateError;

      const nextVersion = admin.sessionVersion + 1;
      await supabase
        .from("admin_profiles")
        .update({ session_version: nextVersion })
        .eq("user_id", admin.id);

      const token = signSession({
        sub: admin.id,
        email: admin.email,
        sv: nextVersion
      });

      await audit({
        actor: admin,
        action: "auth.password",
        entity: "auth",
        entityId: admin.id
      });

      return ok(
        { changed: true },
        { "Set-Cookie": sessionCookie(token) }
      );
    }

    // ------------------------------------------------------------------
    // Productos
    // ------------------------------------------------------------------
    if (path === "/products" && method === "GET") {
      await requireAdmin(event);
      return ok(
        await listProducts({
          q: params.get("q") || undefined,
          category: params.get("category") || undefined,
          status: params.get("status") || undefined,
          page: Number(params.get("page") || 1),
          limit: Number(params.get("limit") || 30)
        })
      );
    }

    if (path === "/products" && method === "POST") {
      assertMutationAllowed(event);
      const admin = await requireAdmin(event);
      const input = productSchema.parse(parseBody(event));
      const created = await createProduct(input, admin);
      await rebuildStore(admin);
      return ok(created, {});
    }

    const productId = uuidMatch(
      path,
      /^\/products\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/
    );

    if (productId && method === "GET") {
      await requireAdmin(event);
      return ok(await getProduct(productId));
    }

    if (productId && (method === "PATCH" || method === "PUT")) {
      assertMutationAllowed(event);
      const admin = await requireAdmin(event);
      const input = productSchema.parse(parseBody(event));
      const updated = await updateProduct(productId, input, admin);
      await rebuildStore(admin);
      return ok(updated);
    }

    if (productId && method === "DELETE") {
      assertMutationAllowed(event);
      const admin = await requireAdmin(event);
      const deleted = await deleteProduct(productId, admin);
      await rebuildStore(admin);
      return ok(deleted);
    }

    const imageAction = path.match(
      /^\/products\/([0-9a-fA-F-]{36})\/images(?:\/([0-9a-fA-F-]{36}))?\/(sign)$/
    );

    if (imageAction && method === "POST") {
      assertMutationAllowed(event);
      const admin = await requireAdmin(event);
      const input = imageSignSchema.parse(parseBody(event));
      return ok(await signImageUpload(imageAction[1], input, admin));
    }

    const imageOrderPath = path.match(
      /^\/products\/([0-9a-fA-F-]{36})\/images\/order$/
    );

    if (imageOrderPath && method === "PUT") {
      assertMutationAllowed(event);
      const admin = await requireAdmin(event);
      const input = imageOrderSchema.parse(parseBody(event));
      const ordered = await reorderImages(imageOrderPath[1], input.imageIds, admin);
      await rebuildStore(admin);
      return ok(ordered);
    }

    const imagesPath = path.match(
      /^\/products\/([0-9a-fA-F-]{36})\/images(?:\/([0-9a-fA-F-]{36}))?$/
    );

    if (imagesPath && method === "POST") {
      assertMutationAllowed(event);
      const admin = await requireAdmin(event);
      const input = imageRegisterSchema.parse(parseBody(event));
      const registered = await registerImage(imagesPath[1], input, admin);
      await rebuildStore(admin);
      return ok(registered);
    }

    if (imagesPath && imagesPath[2] && method === "PATCH") {
      assertMutationAllowed(event);
      const admin = await requireAdmin(event);
      const body = parseBody(event) as { alt?: string | null; isPrimary?: boolean };
      const updatedImage = await updateImage(imagesPath[1], imagesPath[2], body, admin);
      await rebuildStore(admin);
      return ok(updatedImage);
    }

    if (imagesPath && imagesPath[2] && method === "DELETE") {
      assertMutationAllowed(event);
      const admin = await requireAdmin(event);
      const deletedImage = await deleteImage(imagesPath[1], imagesPath[2], admin);
      await rebuildStore(admin);
      return ok(deletedImage);
    }

    // ------------------------------------------------------------------
    // Categorías
    // ------------------------------------------------------------------
    if (path === "/categories" && method === "GET") {
      await requireAdmin(event);
      return ok(await listCategories());
    }

    if (path === "/categories" && method === "POST") {
      assertMutationAllowed(event);
      const admin = await requireAdmin(event);
      const input = categorySchema.parse(parseBody(event));
      const created = await createCategory(input, admin);
      await rebuildStore(admin);
      return ok(created);
    }

    const categoryId = uuidMatch(
      path,
      /^\/categories\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/
    );

    if (categoryId && (method === "PATCH" || method === "PUT")) {
      assertMutationAllowed(event);
      const admin = await requireAdmin(event);
      const input = categorySchema.parse(parseBody(event));
      const updated = await updateCategory(categoryId, input, admin);
      await rebuildStore(admin);
      return ok(updated);
    }

    if (categoryId && method === "DELETE") {
      assertMutationAllowed(event);
      const admin = await requireAdmin(event);
      const deleted = await deleteCategory(categoryId, admin);
      await rebuildStore(admin);
      return ok(deleted);
    }

    // ------------------------------------------------------------------
    // Dashboard, ajustes, versiones, actividad
    // ------------------------------------------------------------------
    if (path === "/stats" && method === "GET") {
      await requireAdmin(event);
      return ok(await getStats());
    }

    if (path === "/settings" && method === "GET") {
      await requireAdmin(event);
      return ok(await getSettings());
    }

    if (path === "/settings" && method === "PUT") {
      assertMutationAllowed(event);
      const admin = await requireAdmin(event);
      const input = settingsSchema.parse(parseBody(event));
      const updated = await updateSettings(input, admin);
      await rebuildStore(admin);
      return ok(updated);
    }

    if (path === "/activity" && method === "GET") {
      await requireAdmin(event);
      const { data, error } = await getSupabase()
        .from("audit_log")
        .select("id,action,entity,entity_id,actor_email,diff,created_at")
        .order("created_at", { ascending: false })
        .limit(60);

      if (error) throw error;
      return ok({ items: data || [] });
    }

    if (path === "/releases" && method === "GET") {
      await requireAdmin(event);
      return ok({ items: await listReleases() });
    }

    if (path === "/releases" && method === "POST") {
      assertMutationAllowed(event);
      const admin = await requireAdmin(event);
      const input = releaseSchema.parse(parseBody(event));
      return ok(await publishRelease(input, admin));
    }

    if (path === "/build" && method === "POST") {
      assertMutationAllowed(event);
      const admin = await requireAdmin(event);
      const body = parseBody(event) as { force?: boolean };
      return ok(await triggerBuild(admin, { force: Boolean(body.force) }));
    }

    return fail(404, "NOT_FOUND", "Ruta no encontrada.");
  } catch (error) {
    return errorResponse(error);
  }
};
