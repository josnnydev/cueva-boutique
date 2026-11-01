import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../api";
import { useToast } from "../toast";
import type { Category } from "../types";

type FormState = {
  name: string;
  slug: string;
  description: string;
  sortOrder: string;
  isActive: boolean;
};

const EMPTY: FormState = {
  name: "",
  slug: "",
  description: "",
  sortOrder: "0",
  isActive: true
};

export default function Categories() {
  const { show } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      setCategories(await api<Category[]>("/categories"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudieron cargar las categorías.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function reset() {
    setEditingId(null);
    setForm(EMPTY);
    setError("");
  }

  function edit(category: Category) {
    setEditingId(category.id);
    setForm({
      name: category.name,
      slug: category.slug,
      description: category.description || "",
      sortOrder: String(category.sortOrder),
      isActive: category.isActive
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (form.name.trim().length < 2) {
      setError("El nombre debe tener al menos 2 caracteres.");
      return;
    }

    setSaving(true);
    setError("");

    const payload = {
      name: form.name.trim(),
      slug: form.slug.trim(),
      description: form.description.trim(),
      sortOrder: Number(form.sortOrder) || 0,
      isActive: form.isActive
    };

    try {
      if (editingId) {
        await api(`/categories/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
        show("Categoría actualizada.", "success");
      } else {
        await api("/categories", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        show("Categoría creada.", "success");
      }
      reset();
      await load();
    } catch (caught) {
      const message =
        caught instanceof ApiError ? caught.message : "No se pudo guardar la categoría.";
      setError(message);
      show(message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove(category: Category) {
    const confirmed = window.confirm(
      `¿Eliminar la categoría "${category.name}"? Solo es posible si no tiene productos.`
    );
    if (!confirmed) return;

    try {
      await api(`/categories/${category.id}`, { method: "DELETE" });
      show("Categoría eliminada.", "success");
      if (editingId === category.id) reset();
      await load();
    } catch (caught) {
      show(caught instanceof ApiError ? caught.message : "No se pudo eliminar.", "error");
    }
  }

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Catálogo</p>
          <h1>Categorías</h1>
          <p className="page-subtitle">Organiza los productos y el menú de filtros de la tienda.</p>
        </div>
      </header>

      {error && <div className="alert alert--error">{error}</div>}

      <div className="editor-grid">
        <section className="card">
          <h2>{editingId ? "Editar categoría" : "Nueva categoría"}</h2>

          <form onSubmit={handleSubmit} className="form">
            <div className="form-grid">
              <label className="field">
                <span>Nombre *</span>
                <input
                  value={form.name}
                  onChange={(event) => update("name", event.target.value)}
                  maxLength={60}
                  required
                  placeholder="Audífonos"
                />
              </label>

              <label className="field">
                <span>Enlace (slug)</span>
                <input
                  value={form.slug}
                  onChange={(event) => update("slug", event.target.value)}
                  maxLength={60}
                  placeholder="audifonos"
                />
              </label>

              <label className="field field--wide">
                <span>Descripción</span>
                <textarea
                  value={form.description}
                  onChange={(event) => update("description", event.target.value)}
                  maxLength={300}
                  rows={2}
                  placeholder="Opcional"
                />
              </label>

              <label className="field">
                <span>Orden</span>
                <input
                  type="number"
                  value={form.sortOrder}
                  onChange={(event) => update("sortOrder", event.target.value)}
                />
              </label>

              <label className="check check--inline">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => update("isActive", event.target.checked)}
                />
                <span>Categoría visible</span>
              </label>
            </div>

            <div className="row-actions">
              <button type="submit" className="btn btn--gold" disabled={saving}>
                {saving ? "Guardando…" : editingId ? "Guardar cambios" : "Crear categoría"}
              </button>
              {editingId && (
                <button type="button" className="btn btn--ghost" onClick={reset}>
                  Cancelar
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="card card--flush">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Categoría</th>
                  <th>Productos</th>
                  <th>Orden</th>
                  <th>Estado</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={5} className="table-empty">
                      Cargando…
                    </td>
                  </tr>
                ) : (
                  categories.map((category) => (
                    <tr key={category.id}>
                      <td>
                        <strong>{category.name}</strong>
                        <small>#{category.slug}</small>
                      </td>
                      <td>{category.productCount || 0}</td>
                      <td>{category.sortOrder}</td>
                      <td>
                        <span className={`pill ${category.isActive ? "pill--ok" : ""}`}>
                          {category.isActive ? "Visible" : "Oculta"}
                        </span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="btn btn--ghost btn--small"
                            onClick={() => edit(category)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="btn btn--danger btn--small"
                            onClick={() => remove(category)}
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
        </section>
      </div>
    </div>
  );
}
