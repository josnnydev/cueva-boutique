import { useEffect, useState } from "react";
import { api, formatDate } from "../api";
import type { ActivityItem } from "../types";

const ACTION_LABELS: Record<string, string> = {
  "product.create": "Producto creado",
  "product.update": "Producto actualizado",
  "product.delete": "Producto eliminado",
  "category.create": "Categoría creada",
  "category.update": "Categoría actualizada",
  "category.delete": "Categoría eliminada",
  "image.sign": "Subida de foto autorizada",
  "image.register": "Foto guardada",
  "image.update": "Foto actualizada",
  "image.delete": "Foto eliminada",
  "settings.update": "Ajustes actualizados",
  "release.publish": "Versión publicada",
  "build.trigger": "Build de Netlify",
  "auth.login": "Inicio de sesión",
  "auth.logout": "Cierre de sesión",
  "auth.password": "Contraseña cambiada"
};

export default function Activity() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ items: ActivityItem[] }>("/activity")
      .then((response) => setItems(response.items))
      .catch((caught) =>
        setError(caught instanceof Error ? caught.message : "No se pudo cargar la actividad.")
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Registro</p>
          <h1>Actividad</h1>
          <p className="page-subtitle">Últimos cambios realizados desde el panel.</p>
        </div>
      </header>

      {error && <div className="alert alert--error">{error}</div>}

      <div className="card card--flush">
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Acción</th>
                <th>Entidad</th>
                <th>Autor</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="table-empty">
                    Cargando…
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={5} className="table-empty">
                    Todavía no hay actividad.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id}>
                    <td className="nowrap">{formatDate(item.created_at)}</td>
                    <td>
                      <strong>{ACTION_LABELS[item.action] || item.action}</strong>
                    </td>
                    <td>
                      {item.entity}
                      {item.entity_id ? (
                        <small className="mono">{item.entity_id.slice(0, 8)}…</small>
                      ) : null}
                    </td>
                    <td>{item.actor_email || "Sistema"}</td>
                    <td>
                      {item.diff ? (
                        <details>
                          <summary>Ver JSON</summary>
                          <pre className="json-detail">
                            {JSON.stringify(item.diff, null, 2)}
                          </pre>
                        </details>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
