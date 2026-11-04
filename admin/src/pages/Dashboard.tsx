import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatBytes, formatDate, formatMoney } from "../api";
import type { Stats } from "../types";

const ACTION_LABELS: Record<string, string> = {
  "product.create": "Producto creado",
  "product.update": "Producto actualizado",
  "product.delete": "Producto eliminado",
  "category.create": "Categoría creada",
  "category.update": "Categoría actualizada",
  "category.delete": "Categoría eliminada",
  "image.register": "Foto actualizada",
  "image.delete": "Foto eliminada",
  "settings.update": "Ajustes actualizados",
  "release.publish": "Versión publicada",
  "build.trigger": "Tienda regenerada",
  "auth.login": "Inicio de sesión"
};

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    api<Stats>("/stats")
      .then((data) => {
        if (active) setStats(data);
      })
      .catch((caught) => {
        if (active) setError(caught instanceof Error ? caught.message : "Error al cargar.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="page">
        <div className="skeleton-grid">
          {Array.from({ length: 4 }).map((_, index) => (
            <div className="skeleton" key={index} />
          ))}
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="page">
        <div className="alert alert--error">{error || "No se pudieron cargar las estadísticas."}</div>
      </div>
    );
  }

  const maxCategory = Math.max(1, ...stats.categories.map((category) => category.count));

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Resumen</p>
          <h1>Panel de Cueva Boutique</h1>
          <p className="page-subtitle">
            Todo lo que pasa en la tienda, en un solo lugar.
          </p>
        </div>
        <Link to="/productos/nuevo" className="btn btn--gold">
          + Nuevo producto
        </Link>
      </header>

      <section className="stats-grid" aria-label="Estadísticas principales">
        <article className="stat-card">
          <span className="stat-card__label">Productos disponibles</span>
          <strong>{stats.products.active}</strong>
          <small>
            {stats.products.total} en total · {stats.products.inactive} agotados
          </small>
        </article>

        <article className="stat-card">
          <span className="stat-card__label">Valor del catálogo</span>
          <strong>{formatMoney(stats.prices.catalogValue)}</strong>
          <small>Promedio {formatMoney(stats.prices.averagePrice)}</small>
        </article>

        <article className="stat-card">
          <span className="stat-card__label">Ofertas</span>
          <strong>{stats.offers.withDiscount}</strong>
          <small>{stats.offers.eligible} elegibles para la rotación diaria</small>
        </article>

        <article className="stat-card">
          <span className="stat-card__label">Fotos</span>
          <strong>{stats.storage.images}</strong>
          <small>{formatBytes(stats.storage.bytes)} en Supabase Storage</small>
        </article>
      </section>

      <div className="dashboard-grid">
        <section className="card">
          <div className="card__head">
            <h2>Productos por categoría</h2>
            <Link to="/categorias">Gestionar</Link>
          </div>
          <div className="category-bars">
            {stats.categories.map((category) => (
              <div className="category-bar" key={category.id}>
                <div className="category-bar__label">
                  <span>{category.name}</span>
                  <strong>{category.count}</strong>
                </div>
                <div className="category-bar__track">
                  <span style={{ width: `${(category.count / maxCategory) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <div className="card__head">
            <h2>Estado de la tienda</h2>
          </div>
          <ul className="detail-list">
            <li>
              <span>Versión publicada</span>
              <strong>{stats.lastRelease?.version || "Sin publicar"}</strong>
            </li>
            <li>
              <span>Última publicación</span>
              <strong>{formatDate(stats.lastRelease?.released_at)}</strong>
            </li>
            <li>
              <span>Actualizados (7 días)</span>
              <strong>{stats.products.updatedLast7Days}</strong>
            </li>
            <li>
              <span>Sin foto principal</span>
              <strong className={stats.products.withoutImage ? "text-warn" : ""}>
                {stats.products.withoutImage}
              </strong>
            </li>
            <li>
              <span>Rango de precios</span>
              <strong>
                {formatMoney(stats.prices.min)} – {formatMoney(stats.prices.max)}
              </strong>
            </li>
          </ul>
          <Link to="/ajustes" className="btn btn--ghost btn--full">
            Publicar una versión
          </Link>
        </section>
      </div>

      <section className="card">
        <div className="card__head">
          <h2>Actividad reciente</h2>
          <Link to="/actividad">Ver todo</Link>
        </div>
        {stats.recentActivity.length === 0 ? (
          <p className="empty">Todavía no hay actividad registrada.</p>
        ) : (
          <ul className="activity-list">
            {stats.recentActivity.map((item) => (
              <li key={item.id}>
                <span className="activity-dot" aria-hidden="true" />
                <div>
                  <strong>{ACTION_LABELS[item.action] || item.action}</strong>
                  <small>
                    {item.actor_email || "Sistema"} · {formatDate(item.created_at)}
                  </small>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
