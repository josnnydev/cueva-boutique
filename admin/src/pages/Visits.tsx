import { useEffect, useState } from "react";
import { api } from "../api";
import type { VisitReferrerKey, VisitStats } from "../types";

const REFERRER_BADGES: Record<VisitReferrerKey, string> = {
  instagram: "IG",
  facebook: "FB",
  whatsapp: "WA",
  google: "G",
  directo: "D",
  otros: "+"
};

function formatNumber(value: number): string {
  return new Intl.NumberFormat("es-DO").format(value);
}

function VisitsChart({ daily }: { daily: VisitStats["daily"] }) {
  const width = 760;
  const height = 260;
  const padding = { top: 18, right: 12, bottom: 34, left: 42 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(1, ...daily.map((item) => item.visits));
  const step = plotWidth / Math.max(1, daily.length);
  const barWidth = Math.max(3, step * 0.56);
  const labelEvery = Math.max(1, Math.ceil(daily.length / 8));

  const y = (value: number) =>
    padding.top + plotHeight - (Math.min(value, maxValue) / maxValue) * plotHeight;

  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const points = daily
    .map((item, index) => {
      const x = padding.left + step * index + step / 2;
      return `${x},${y(item.unique)}`;
    })
    .join(" ");

  return (
    <div>
      <svg
        className="visits-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Gráfico de visitas y visitantes únicos por día"
      >
        {ticks.map((tick) => {
          const value = Math.round(maxValue * tick);
          const lineY = y(maxValue * tick);
          return (
            <g key={tick}>
              <line
                className="visits-chart__grid"
                x1={padding.left}
                x2={width - padding.right}
                y1={lineY}
                y2={lineY}
              />
              <text
                className="visits-chart__axis"
                x={padding.left - 8}
                y={lineY + 3}
                textAnchor="end"
              >
                {value}
              </text>
            </g>
          );
        })}

        {daily.map((item, index) => {
          const x = padding.left + step * index + (step - barWidth) / 2;
          const barHeight = Math.max(0, padding.top + plotHeight - y(item.visits));
          return (
            <g key={item.date}>
              <rect
                className="visits-chart__bar"
                x={x}
                y={y(item.visits)}
                width={barWidth}
                height={barHeight}
                rx={2}
              >
                <title>
                  {item.label}: {item.visits} visitas · {item.unique} únicos
                </title>
              </rect>
              {(index === daily.length - 1 ||
                (index % labelEvery === 0 &&
                  daily.length - 1 - index >= Math.ceil(labelEvery / 2))) && (
                <text
                  className="visits-chart__axis"
                  x={x + barWidth / 2}
                  y={height - 12}
                  textAnchor="middle"
                >
                  {item.label}
                </text>
              )}
            </g>
          );
        })}

        <polyline className="visits-chart__line" points={points} />
        {daily.map((item, index) => {
          const x = padding.left + step * index + step / 2;
          return (
            <circle
              key={`dot-${item.date}`}
              className="visits-chart__dot"
              cx={x}
              cy={y(item.unique)}
              r={2.4}
            >
              <title>
                {item.label}: {item.unique} visitantes únicos
              </title>
            </circle>
          );
        })}
      </svg>

      <div className="chart-legend">
        <span>
          <i className="legend-bar" aria-hidden="true" />
          Visitas
        </span>
        <span>
          <i className="legend-line" aria-hidden="true" />
          Visitantes únicos por día
        </span>
      </div>
    </div>
  );
}

export default function Visits() {
  const [days, setDays] = useState<7 | 30>(30);
  const [stats, setStats] = useState<VisitStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");

    api<VisitStats>(`/visits?days=${days}`)
      .then((data) => {
        if (active) setStats(data);
      })
      .catch((caught) => {
        if (active) {
          setError(
            caught instanceof Error ? caught.message : "No se pudieron cargar las visitas."
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [days]);

  const maxPage = Math.max(1, ...(stats?.topPages.map((page) => page.visits) || [1]));
  const averagePerDay = stats
    ? Math.round((stats.totals.last30 / 30) * 10) / 10
    : 0;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Audiencia</p>
          <h1>Estadísticas de visitas</h1>
          <p className="page-subtitle">
            Visitas anónimas de la tienda. No se guardan IPs ni datos personales.
          </p>
        </div>

        <div className="segmented" role="group" aria-label="Periodo de las estadísticas">
          <button
            type="button"
            className={days === 7 ? "is-active" : ""}
            onClick={() => setDays(7)}
            aria-pressed={days === 7}
          >
            Últimos 7 días
          </button>
          <button
            type="button"
            className={days === 30 ? "is-active" : ""}
            onClick={() => setDays(30)}
            aria-pressed={days === 30}
          >
            Últimos 30 días
          </button>
        </div>
      </header>

      {error && <div className="alert alert--error">{error}</div>}

      {!stats && loading && (
        <div className="skeleton-grid">
          {Array.from({ length: 4 }).map((_, index) => (
            <div className="skeleton" key={index} />
          ))}
        </div>
      )}

      {stats && (
        <>
          <section className="stats-grid" aria-label="Resumen de visitas">
            <article className="stat-card">
              <span className="stat-card__label">Visitas hoy</span>
              <strong>{formatNumber(stats.totals.today)}</strong>
              <small>{formatNumber(stats.totals.uniqueToday)} visitantes únicos</small>
            </article>

            <article className="stat-card">
              <span className="stat-card__label">Últimos 7 días</span>
              <strong>{formatNumber(stats.totals.last7)}</strong>
              <small>{formatNumber(stats.totals.unique7)} visitantes únicos</small>
            </article>

            <article className="stat-card">
              <span className="stat-card__label">Últimos 30 días</span>
              <strong>{formatNumber(stats.totals.last30)}</strong>
              <small>{formatNumber(stats.totals.unique30)} visitantes únicos</small>
            </article>

            <article className="stat-card">
              <span className="stat-card__label">Promedio diario</span>
              <strong>{formatNumber(averagePerDay)}</strong>
              <small>Visitas por día en los últimos 30 días</small>
            </article>
          </section>

          <section className="card visits-chart-card">
            <div className="card__head">
              <h2>Visitas por día</h2>
              {loading && <span className="muted small">Actualizando…</span>}
            </div>
            {stats.windowTotal === 0 ? (
              <p className="visits-empty">
                Todavía no hay visitas en este periodo. La primera visita aparecerá aquí
                en cuanto alguien abra la tienda.
              </p>
            ) : (
              <VisitsChart daily={stats.daily} />
            )}
          </section>

          <div className="visits-grid">
            <section className="card">
              <div className="card__head">
                <h2>Páginas y productos más vistos</h2>
                <span className="muted small">Top 10 · {days} días</span>
              </div>

              {stats.topPages.length === 0 ? (
                <p className="visits-empty">Sin datos en este periodo.</p>
              ) : (
                <ol className="visit-list">
                  {stats.topPages.map((page, index) => (
                    <li key={page.page}>
                      <span className="visit-rank">{index + 1}</span>
                      <div className="visit-list__body">
                        <div className="visit-list__row">
                          <strong title={page.label}>{page.label}</strong>
                          <span>{formatNumber(page.visits)}</span>
                        </div>
                        {page.page !== "/" && page.label !== page.page && (
                          <small className="visit-list__path">{page.page}</small>
                        )}
                        <div className="visit-bar">
                          <span
                            style={{ width: `${(page.visits / maxPage) * 100}%` }}
                          />
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="card">
              <div className="card__head">
                <h2>De dónde llegan</h2>
                <span className="muted small">{days} días</span>
              </div>

              {stats.referrers.length === 0 ? (
                <p className="visits-empty">Sin referentes en este periodo.</p>
              ) : (
                <ul className="referrer-list">
                  {stats.referrers.map((referrer) => (
                    <li key={referrer.key}>
                      <span className="referrer-badge" aria-hidden="true">
                        {REFERRER_BADGES[referrer.key]}
                      </span>
                      <div className="referrer-list__body">
                        <div className="referrer-list__row">
                          <strong>{referrer.label}</strong>
                          <span>
                            {formatNumber(referrer.visits)} · {referrer.share}%
                          </span>
                        </div>
                        <div className="visit-bar">
                          <span style={{ width: `${Math.max(referrer.share, 2)}%` }} />
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <p className="visits-note">
                «Directo» incluye a quienes abren el enlace sin referente o desde el mismo
                sitio. Los bots y tus propias visitas como administrador no se cuentan.
              </p>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
