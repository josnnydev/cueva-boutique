import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError, formatDate, formatMoney } from "../api";
import { useToast } from "../toast";
import ImageUploader from "../components/ImageUploader";
import type { Category, Product, ProductInput } from "../types";

type FormState = {
  name: string;
  slug: string;
  shortDescription: string;
  description: string;
  price: string;
  compareAtPrice: string;
  categoryId: string;
  badge: string;
  sku: string;
  isActive: boolean;
  offerEligible: boolean;
  baseDiscount: string;
  sortOrder: string;
  seoTitle: string;
  seoDescription: string;
};

const EMPTY: FormState = {
  name: "",
  slug: "",
  shortDescription: "",
  description: "",
  price: "",
  compareAtPrice: "",
  categoryId: "",
  badge: "",
  sku: "",
  isActive: true,
  offerEligible: true,
  baseDiscount: "0",
  sortOrder: "0",
  seoTitle: "",
  seoDescription: ""
};

function toForm(product: Product): FormState {
  return {
    name: product.name,
    slug: product.slug,
    shortDescription: product.shortDescription || "",
    description: product.description || "",
    price: String(product.price),
    compareAtPrice:
      product.compareAtPrice === null ? "" : String(product.compareAtPrice),
    categoryId: product.category?.id || "",
    badge: product.badge || "",
    sku: product.sku || "",
    isActive: product.isActive,
    offerEligible: product.offerEligible,
    baseDiscount: String(product.baseDiscount),
    sortOrder: String(product.sortOrder),
    seoTitle: product.seoTitle || "",
    seoDescription: product.seoDescription || ""
  };
}

export default function ProductEdit() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();
  const { show } = useToast();

  const [product, setProduct] = useState<Product | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");
      try {
        const categoryList = await api<Category[]>("/categories");
        if (!active) return;
        setCategories(categoryList);

        if (id) {
          const loaded = await api<Product>(`/products/${id}`);
          if (!active) return;
          setProduct(loaded);
          setForm(toForm(loaded));
        } else {
          setForm((current) => ({
            ...current,
            categoryId: current.categoryId || categoryList[0]?.id || ""
          }));
        }
      } catch (caught) {
        if (active) {
          setError(caught instanceof Error ? caught.message : "No se pudo cargar el producto.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [id]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function reloadProduct() {
    if (!id) return;
    const loaded = await api<Product>(`/products/${id}`);
    // No reiniciamos el formulario: puede tener cambios sin guardar.
    setProduct(loaded);
  }

  function validate(): string {
    if (form.name.trim().length < 2) return "El nombre debe tener al menos 2 caracteres.";
    if (!form.categoryId) return "Selecciona una categoría.";
    const price = Number(form.price);
    if (!Number.isFinite(price) || price < 0) return "El precio no es válido.";
    if (form.compareAtPrice.trim()) {
      const oldPrice = Number(form.compareAtPrice);
      if (!Number.isFinite(oldPrice) || oldPrice <= price) {
        return "El precio anterior debe ser mayor que el precio actual.";
      }
    }
    return "";
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const validation = validate();
    if (validation) {
      setError(validation);
      return;
    }

    const payload: ProductInput = {
      name: form.name.trim(),
      slug: form.slug.trim(),
      shortDescription: form.shortDescription.trim(),
      description: form.description.trim(),
      price: Number(form.price),
      compareAtPrice: form.compareAtPrice.trim() ? Number(form.compareAtPrice) : null,
      categoryId: form.categoryId,
      badge: form.badge.trim(),
      sku: form.sku.trim(),
      isActive: form.isActive,
      offerEligible: form.offerEligible,
      baseDiscount: Number(form.baseDiscount) || 0,
      sortOrder: Number(form.sortOrder) || 0,
      seoTitle: form.seoTitle.trim(),
      seoDescription: form.seoDescription.trim()
    };

    setSaving(true);
    setError("");

    try {
      if (isNew) {
        const created = await api<Product>("/products", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        show("Producto creado. Ahora puedes subir su foto.", "success");
        navigate(`/productos/${created.id}`, { replace: true });
      } else {
        const updated = await api<Product>(`/products/${id}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
        setProduct(updated);
        setForm(toForm(updated));
        show("Cambios guardados.", "success");
      }
    } catch (caught) {
      const message =
        caught instanceof ApiError ? caught.message : "No se pudo guardar el producto.";
      setError(message);
      show(message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function removeProduct() {
    if (!product) return;
    const confirmed = window.confirm(
      `¿Eliminar "${product.name}"? Esta acción no se puede deshacer.`
    );
    if (!confirmed) return;

    try {
      await api(`/products/${product.id}`, { method: "DELETE" });
      show("Producto eliminado.", "success");
      navigate("/productos", { replace: true });
    } catch (caught) {
      const message =
        caught instanceof ApiError ? caught.message : "No se pudo eliminar el producto.";
      show(message, "error");
    }
  }

  if (loading) {
    return (
      <div className="page">
        <div className="skeleton skeleton--tall" />
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">{isNew ? "Nuevo" : "Editar"}</p>
          <h1>{isNew ? "Agregar producto" : form.name || "Producto"}</h1>
          <p className="page-subtitle">
            {isNew
              ? "Completa los datos y guarda para poder subir la foto."
              : `Actualizado ${formatDate(product?.updatedAt)}`}
          </p>
        </div>
        <div className="head-actions">
          <Link to="/productos" className="btn btn--ghost">
            ← Volver
          </Link>
          <button
            type="submit"
            form="product-form"
            className="btn btn--gold"
            disabled={saving}
          >
            {saving ? "Guardando…" : isNew ? "Crear producto" : "Guardar cambios"}
          </button>
        </div>
      </header>

      {error && <div className="alert alert--error">{error}</div>}

      <form id="product-form" onSubmit={handleSubmit} className="editor-grid">
        <div className="editor-main">
          <section className="card">
            <h2>Información básica</h2>

            <div className="form-grid">
              <label className="field field--wide">
                <span>Nombre *</span>
                <input
                  value={form.name}
                  onChange={(event) => update("name", event.target.value)}
                  maxLength={120}
                  required
                  placeholder="KZ ZS10 Pro X"
                />
              </label>

              <label className="field field--wide">
                <span>Enlace (slug)</span>
                <input
                  value={form.slug}
                  onChange={(event) => update("slug", event.target.value)}
                  maxLength={80}
                  placeholder="se-genera-del-nombre"
                />
                <small>
                  Se usa en la URL. El anchor actual de la tienda se conserva aunque lo
                  cambies.
                </small>
              </label>

              <label className="field field--wide">
                <span>Descripción de la tarjeta</span>
                <textarea
                  value={form.shortDescription}
                  onChange={(event) => update("shortDescription", event.target.value)}
                  maxLength={300}
                  rows={3}
                  placeholder="Texto breve que aparece en el catálogo."
                />
                <small>{form.shortDescription.length}/300</small>
              </label>

              <label className="field field--wide">
                <span>Descripción larga (opcional)</span>
                <textarea
                  value={form.description}
                  onChange={(event) => update("description", event.target.value)}
                  maxLength={5000}
                  rows={5}
                  placeholder="Detalles, materiales, compatibilidad…"
                />
              </label>
            </div>
          </section>

          <section className="card">
            <h2>Precio y oferta</h2>

            <div className="form-grid">
              <label className="field">
                <span>Precio actual (DOP) *</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(event) => update("price", event.target.value)}
                  required
                  placeholder="2250"
                />
              </label>

              <label className="field">
                <span>Precio anterior (opcional)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.compareAtPrice}
                  onChange={(event) => update("compareAtPrice", event.target.value)}
                  placeholder="Ej. 1550"
                />
                <small>Se muestra tachado y debe ser mayor que el actual.</small>
              </label>

              <label className="field">
                <span>Descuento base (%)</span>
                <input
                  type="number"
                  min="0"
                  max="90"
                  step="1"
                  value={form.baseDiscount}
                  onChange={(event) => update("baseDiscount", event.target.value)}
                />
                <small>Descuento permanente. 0 = sin descuento fijo.</small>
              </label>

              <label className="field">
                <span>Orden en el catálogo</span>
                <input
                  type="number"
                  step="1"
                  value={form.sortOrder}
                  onChange={(event) => update("sortOrder", event.target.value)}
                />
                <small>Menor número aparece primero.</small>
              </label>
            </div>

            <label className="check">
              <input
                type="checkbox"
                checked={form.offerEligible}
                onChange={(event) => update("offerEligible", event.target.checked)}
              />
              <span>Participa en la rotación de ofertas diarias</span>
            </label>
          </section>

          <section className="card">
            <h2>Organización</h2>

            <div className="form-grid">
              <label className="field">
                <span>Categoría *</span>
                <select
                  value={form.categoryId}
                  onChange={(event) => update("categoryId", event.target.value)}
                  required
                >
                  <option value="">Selecciona una categoría</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                <span>Etiqueta (badge)</span>
                <input
                  value={form.badge}
                  onChange={(event) => update("badge", event.target.value)}
                  maxLength={40}
                  list="badge-options"
                  placeholder="Favorito, Nuevo, Top ventas…"
                />
                <datalist id="badge-options">
                  <option value="Favorito" />
                  <option value="Más vendido" />
                  <option value="Nuevo" />
                  <option value="Top ventas" />
                  <option value="Oferta" />
                  <option value="Premium" />
                </datalist>
              </label>

              <label className="field">
                <span>SKU (opcional)</span>
                <input
                  value={form.sku}
                  onChange={(event) => update("sku", event.target.value)}
                  maxLength={60}
                  placeholder="KZ-ZS10-PX"
                />
              </label>

              <label className="check check--inline">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => update("isActive", event.target.checked)}
                />
                <span>Disponible para comprar</span>
              </label>
              <small className="muted">
                Si lo desactivas, el producto seguirá visible en la tienda con el cartel
                «Agotado» y no se podrá agregar al carrito.
              </small>
            </div>
          </section>

          <details className="card details">
            <summary>SEO y metadatos</summary>
            <div className="form-grid">
              <label className="field field--wide">
                <span>Título SEO</span>
                <input
                  value={form.seoTitle}
                  onChange={(event) => update("seoTitle", event.target.value)}
                  maxLength={70}
                  placeholder="Opcional. Si se deja vacío se usa el nombre."
                />
              </label>
              <label className="field field--wide">
                <span>Descripción SEO</span>
                <textarea
                  value={form.seoDescription}
                  onChange={(event) => update("seoDescription", event.target.value)}
                  maxLength={160}
                  rows={2}
                  placeholder="Opcional. Si se deja vacía se usa la descripción corta."
                />
              </label>
            </div>
          </details>
        </div>

        <aside className="editor-aside">
          <section className="card">
            <h2>Fotos</h2>
            {product ? (
              <ImageUploader product={product} onUpdated={reloadProduct} />
            ) : (
              <p className="empty">
                Guarda el producto primero. Después podrás subir y ajustar su galería.
              </p>
            )}
          </section>

          <section className="card">
            <h2>Resumen</h2>
            <ul className="detail-list">
              <li>
                <span>Estado</span>
                <strong>{form.isActive ? "Disponible" : "Agotado"}</strong>
              </li>
              <li>
                <span>Precio</span>
                <strong>{form.price ? formatMoney(Number(form.price)) : "—"}</strong>
              </li>
              <li>
                <span>Ofertas diarias</span>
                <strong>{form.offerEligible ? "Sí" : "No"}</strong>
              </li>
              {product && (
                <li>
                  <span>Anchor</span>
                  <strong className="mono">#{product.anchor}</strong>
                </li>
              )}
            </ul>

            {product && (
              <a
                className="btn btn--ghost btn--full btn--small"
                href={`/#${product.anchor}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Ver en la tienda ↗
              </a>
            )}

            {!isNew && product && (
              <button
                type="button"
                className="btn btn--danger btn--full btn--small"
                onClick={removeProduct}
              >
                Eliminar producto
              </button>
            )}
          </section>
        </aside>
      </form>
    </div>
  );
}
