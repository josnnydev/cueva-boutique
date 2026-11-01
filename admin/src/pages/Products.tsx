import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError, formatMoney } from "../api";
import { useToast } from "../toast";
import type { Category, Product, ProductInput } from "../types";

function toPayload(product: Product, overrides: Partial<ProductInput> = {}): ProductInput {
  return {
    name: product.name,
    slug: product.slug,
    shortDescription: product.shortDescription || "",
    description: product.description || "",
    price: product.price,
    compareAtPrice: product.compareAtPrice,
    categoryId: product.category?.id || "",
    badge: product.badge || "",
    sku: product.sku || "",
    isActive: product.isActive,
    offerEligible: product.offerEligible,
    baseDiscount: product.baseDiscount,
    sortOrder: product.sortOrder,
    seoTitle: product.seoTitle || "",
    seoDescription: product.seoDescription || "",
    ...overrides
  };
}

type ListResponse = {
  items: Product[];
  total: number;
  page: number;
  limit: number;
};

export default function Products() {
  const { show } = useToast();
  const [items, setItems] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const limit = 20;

  useEffect(() => {
    api<Category[]>("/categories")
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    const params = new URLSearchParams({
      page: String(page),
      limit: String(limit)
    });
    if (query.trim()) params.set("q", query.trim());
    if (status !== "all") params.set("status", status);
    if (category) params.set("category", category);

    try {
      const response = await api<ListResponse>(`/products?${params.toString()}`);
      setItems(response.items);
      setTotal(response.total);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudieron cargar los productos.");
    } finally {
      setLoading(false);
    }
  }, [page, query, status, category]);

  useEffect(() => {
    const timer = window.setTimeout(load, query ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [load, query]);

  async function toggleActive(product: Product) {
    setBusyId(product.id);
    try {
      const updated = await api<Product>(`/products/${product.id}`, {
        method: "PATCH",
        body: JSON.stringify(toPayload(product, { isActive: !product.isActive }))
      });
      setItems((current) =>
        current.map((item) => (item.id === updated.id ? updated : item))
      );
      show(updated.isActive ? "Producto activado." : "Producto desactivado.", "success");
    } catch (caught) {
      show(caught instanceof ApiError ? caught.message : "No se pudo cambiar el estado.", "error");
    } finally {
      setBusyId("");
    }
  }

  async function remove(product: Product) {
    const confirmed = window.confirm(
      `¿Eliminar "${product.name}"? Esta acción no se puede deshacer.`
    );
    if (!confirmed) return;

    setBusyId(product.id);
    try {
      await api(`/products/${product.id}`, { method: "DELETE" });
      setItems((current) => current.filter((item) => item.id !== product.id));
      setTotal((value) => Math.max(0, value - 1));
      show("Producto eliminado.", "success");
    } catch (caught) {
      show(caught instanceof ApiError ? caught.message : "No se pudo eliminar.", "error");
    } finally {
      setBusyId("");
    }
  }

  const pages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Catálogo</p>
          <h1>Productos</h1>
          <p className="page-subtitle">{total} productos registrados.</p>
        </div>
        <Link to="/productos/nuevo" className="btn btn--gold">
          + Nuevo producto
        </Link>
      </header>

      <div className="toolbar">
        <label className="search">
          <span className="sr-only">Buscar productos</span>
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            placeholder="Buscar por nombre…"
          />
        </label>

        <select
          value={category}
          onChange={(event) => {
            setCategory(event.target.value);
            setPage(1);
          }}
          aria-label="Filtrar por categoría"
        >
          <option value="">Todas las categorías</option>
          {categories.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>

        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          aria-label="Filtrar por estado"
        >
          <option value="all">Todos</option>
          <option value="active">Activos</option>
          <option value="inactive">Desactivados</option>
        </select>
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      <div className="card card--flush">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Categoría</th>
                <th>Precio</th>
                <th>Oferta</th>
                <th>Estado</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="table-empty">
                    Cargando productos…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="table-empty">
                    No hay productos con estos filtros.
                  </td>
                </tr>
              ) : (
                items.map((product) => (
                  <tr key={product.id}>
                    <td>
                      <div className="product-cell">
                        <div className="product-thumb">
                          {product.image?.thumbUrl ? (
                            <img src={product.image.thumbUrl} alt="" loading="lazy" />
                          ) : (
                            <span>Sin foto</span>
                          )}
                        </div>
                        <div>
                          <strong>{product.name}</strong>
                          <small>#{product.slug}</small>
                        </div>
                      </div>
                    </td>
                    <td>{product.category?.name || "—"}</td>
                    <td>
                      <strong>{formatMoney(product.price)}</strong>
                      {product.compareAtPrice && (
                        <small className="old-price">{formatMoney(product.compareAtPrice)}</small>
                      )}
                    </td>
                    <td>
                      {product.baseDiscount > 0 ? (
                        <span className="pill pill--gold">−{product.baseDiscount}%</span>
                      ) : product.offerEligible ? (
                        <span className="pill">Elegible</span>
                      ) : (
                        <span className="muted">No</span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`switch ${product.isActive ? "is-on" : ""}`}
                        onClick={() => toggleActive(product)}
                        disabled={busyId === product.id}
                        aria-label={product.isActive ? "Desactivar producto" : "Activar producto"}
                        aria-pressed={product.isActive}
                      >
                        <span />
                      </button>
                      <small>{product.isActive ? "Activo" : "Oculto"}</small>
                    </td>
                    <td>
                      <div className="row-actions">
                        <Link to={`/productos/${product.id}`} className="btn btn--ghost btn--small">
                          Editar
                        </Link>
                        <button
                          type="button"
                          className="btn btn--danger btn--small"
                          onClick={() => remove(product)}
                          disabled={busyId === product.id}
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {pages > 1 && (
        <div className="pagination">
          <button
            type="button"
            className="btn btn--ghost btn--small"
            disabled={page <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            ← Anterior
          </button>
          <span>
            Página {page} de {pages}
          </span>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            disabled={page >= pages}
            onClick={() => setPage((value) => Math.min(pages, value + 1))}
          >
            Siguiente →
          </button>
        </div>
      )}
    </div>
  );
}
