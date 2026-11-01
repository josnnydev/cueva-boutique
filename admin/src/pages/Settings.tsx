import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError, formatDate } from "../api";
import { useToast } from "../toast";
import type {
  DailyOffersSettings,
  Release,
  Settings as SettingsType,
  StoreSettings
} from "../types";

const DEFAULT_STORE: StoreSettings = {
  name: "Cueva Boutique",
  whatsapp: "18293815317",
  generalLink: "",
  instagramHandle: "@cueva_boutique",
  instagramUrl: "",
  locale: "es-DO",
  currency: "DOP",
  currencySymbol: "$"
};

const DEFAULT_OFFERS: DailyOffersSettings = {
  enabled: true,
  count: 6,
  step: 0,
  highDiscount: 15,
  highCount: 3,
  lowDiscount: 10,
  startDate: "2026-10-31",
  seed: 484
};

function nextPatch(version: string): string {
  const parts = version.split(".").map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return "1.2.0";
  return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
}

export default function Settings() {
  const { show } = useToast();
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [store, setStore] = useState<StoreSettings>(DEFAULT_STORE);
  const [offers, setOffers] = useState<DailyOffersSettings>(DEFAULT_OFFERS);
  const [releases, setReleases] = useState<Release[]>([]);
  const [version, setVersion] = useState("1.2.0");
  const [notes, setNotes] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [rebuilding, setRebuilding] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    try {
      const [loaded, releaseResponse] = await Promise.all([
        api<SettingsType>("/settings"),
        api<{ items: Release[] }>("/releases")
      ]);
      setSettings(loaded);
      setStore({ ...DEFAULT_STORE, ...loaded.store });
      setOffers({ ...DEFAULT_OFFERS, ...loaded.dailyOffers });
      setReleases(releaseResponse.items);
      setVersion(nextPatch(loaded.site.version || "1.1.0"));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "No se pudieron cargar los ajustes.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function updateStore<K extends keyof StoreSettings>(key: K, value: StoreSettings[K]) {
    setStore((current) => ({ ...current, [key]: value }));
  }

  function updateOffers<K extends keyof DailyOffersSettings>(
    key: K,
    value: DailyOffersSettings[K]
  ) {
    setOffers((current) => ({ ...current, [key]: value }));
  }

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");

    try {
      const updated = await api<SettingsType>("/settings", {
        method: "PUT",
        body: JSON.stringify({ store, dailyOffers: offers })
      });
      setSettings(updated);
      show("Ajustes guardados.", "success");
    } catch (caught) {
      const message =
        caught instanceof ApiError ? caught.message : "No se pudieron guardar los ajustes.";
      setError(message);
      show(message, "error");
    } finally {
      setSaving(false);
    }
  }

  async function publish(event: FormEvent) {
    event.preventDefault();
    setPublishing(true);
    setError("");

    try {
      const response = await api<{
        release: Release;
        build: { triggered: boolean; reason: string };
      }>("/releases", {
        method: "POST",
        body: JSON.stringify({ version, notes: notes.trim() || null })
      });

      show(
        response.build.triggered
          ? `Versión ${response.release.version} publicada. Build iniciado.`
          : `Versión ${response.release.version} guardada. ${response.build.reason}`,
        response.build.triggered ? "success" : "info"
      );
      setNotes("");
      await load();
    } catch (caught) {
      const message =
        caught instanceof ApiError ? caught.message : "No se pudo publicar la versión.";
      setError(message);
      show(message, "error");
    } finally {
      setPublishing(false);
    }
  }

  async function rebuild() {
    setRebuilding(true);
    setError("");
    try {
      const response = await api<{ triggered: boolean; reason: string }>("/build", {
        method: "POST",
        body: JSON.stringify({ force: true })
      });
      show(response.reason, response.triggered ? "success" : "info");
      if (response.triggered) await load();
    } catch (caught) {
      const message =
        caught instanceof ApiError ? caught.message : "No se pudo iniciar el build.";
      setError(message);
      show(message, "error");
    } finally {
      setRebuilding(false);
    }
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    if (newPassword !== confirmPassword) {
      show("Las contraseñas nuevas no coinciden.", "error");
      return;
    }
    if (newPassword.length < 8) {
      show("La contraseña nueva debe tener al menos 8 caracteres.", "error");
      return;
    }

    setChangingPassword(true);
    try {
      await api("/auth/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword })
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      show("Contraseña actualizada.", "success");
    } catch (caught) {
      show(
        caught instanceof ApiError ? caught.message : "No se pudo cambiar la contraseña.",
        "error"
      );
    } finally {
      setChangingPassword(false);
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
          <p className="eyebrow">Configuración</p>
          <h1>Ajustes</h1>
          <p className="page-subtitle">
            Datos de contacto, ofertas, versiones y seguridad del panel.
          </p>
        </div>
      </header>

      {error && <div className="alert alert--error">{error}</div>}

      <form onSubmit={saveSettings} className="settings-grid">
        <section className="card">
          <h2>Tienda y contacto</h2>
          <div className="form-grid">
            <label className="field">
              <span>Nombre de la tienda</span>
              <input
                value={store.name}
                onChange={(event) => updateStore("name", event.target.value)}
                maxLength={80}
                required
              />
            </label>

            <label className="field">
              <span>WhatsApp (solo números)</span>
              <input
                value={store.whatsapp}
                onChange={(event) => updateStore("whatsapp", event.target.value)}
                maxLength={20}
                required
              />
            </label>

            <label className="field field--wide">
              <span>Enlace general de WhatsApp</span>
              <input
                value={store.generalLink}
                onChange={(event) => updateStore("generalLink", event.target.value)}
                maxLength={300}
                placeholder="https://wa.me/message/…"
              />
            </label>

            <label className="field">
              <span>Instagram</span>
              <input
                value={store.instagramHandle}
                onChange={(event) => updateStore("instagramHandle", event.target.value)}
                maxLength={80}
              />
            </label>

            <label className="field">
              <span>Enlace de Instagram</span>
              <input
                value={store.instagramUrl}
                onChange={(event) => updateStore("instagramUrl", event.target.value)}
                maxLength={300}
              />
            </label>

            <label className="field">
              <span>Locale</span>
              <input
                value={store.locale}
                onChange={(event) => updateStore("locale", event.target.value)}
                maxLength={20}
              />
            </label>

            <label className="field">
              <span>Moneda</span>
              <input
                value={store.currency}
                onChange={(event) => updateStore("currency", event.target.value)}
                maxLength={10}
              />
            </label>

            <label className="field">
              <span>Símbolo</span>
              <input
                value={store.currencySymbol}
                onChange={(event) => updateStore("currencySymbol", event.target.value)}
                maxLength={5}
              />
            </label>
          </div>
        </section>

        <section className="card">
          <h2>Ofertas diarias</h2>
          <p className="muted">
            La tienda elige 6 productos elegibles al día y reparte 3 descuentos altos y 3
            bajos. El descuento base de cada producto se configura en su ficha.
          </p>

          <label className="check">
            <input
              type="checkbox"
              checked={offers.enabled}
              onChange={(event) => updateOffers("enabled", event.target.checked)}
            />
            <span>Activar rotación automática</span>
          </label>

          <div className="form-grid">
            <label className="field">
              <span>Productos por día</span>
              <input
                type="number"
                min="1"
                max="12"
                value={offers.count}
                onChange={(event) => updateOffers("count", Number(event.target.value))}
              />
            </label>

            <label className="field">
              <span>Descuento alto (%)</span>
              <input
                type="number"
                min="0"
                max="90"
                value={offers.highDiscount}
                onChange={(event) =>
                  updateOffers("highDiscount", Number(event.target.value))
                }
              />
            </label>

            <label className="field">
              <span>Cantidad con descuento alto</span>
              <input
                type="number"
                min="0"
                max="12"
                value={offers.highCount}
                onChange={(event) => updateOffers("highCount", Number(event.target.value))}
              />
            </label>

            <label className="field">
              <span>Descuento bajo (%)</span>
              <input
                type="number"
                min="0"
                max="90"
                value={offers.lowDiscount}
                onChange={(event) => updateOffers("lowDiscount", Number(event.target.value))}
              />
            </label>

            <label className="field">
              <span>Fecha de inicio</span>
              <input
                type="date"
                value={offers.startDate}
                onChange={(event) => updateOffers("startDate", event.target.value)}
              />
            </label>

            <label className="field">
              <span>Semilla</span>
              <input
                type="number"
                min="1"
                value={offers.seed}
                onChange={(event) => updateOffers("seed", Number(event.target.value))}
              />
            </label>

            <label className="field">
              <span>Paso</span>
              <input
                type="number"
                min="0"
                value={offers.step}
                onChange={(event) => updateOffers("step", Number(event.target.value))}
              />
              <small>0 = automático (cantidad + 1).</small>
            </label>
          </div>
        </section>

        <div className="settings-actions">
          <button type="submit" className="btn btn--gold" disabled={saving}>
            {saving ? "Guardando…" : "Guardar ajustes"}
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={rebuild}
            disabled={rebuilding}
          >
            {rebuilding ? "Iniciando…" : "Regenerar tienda ahora"}
          </button>
        </div>
      </form>

      <div className="editor-grid">
        <section className="card">
          <h2>Publicar versión</h2>
          <p className="muted">
            Versión actual: <strong>{settings?.site.version || "—"}</strong> ·{" "}
            {settings?.site.updatedAt || "sin fecha"}
          </p>

          <form onSubmit={publish} className="form">
            <div className="form-grid">
              <label className="field">
                <span>Nueva versión</span>
                <input
                  value={version}
                  onChange={(event) => setVersion(event.target.value)}
                  pattern="\d+\.\d+\.\d+"
                  required
                />
              </label>
              <label className="field field--wide">
                <span>Notas del cambio</span>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="Ej. Nuevos audífonos y fotos actualizadas."
                />
              </label>
            </div>
            <button type="submit" className="btn btn--gold" disabled={publishing}>
              {publishing ? "Publicando…" : "Publicar y reconstruir"}
            </button>
          </form>

          <p className="muted small">
            Último build: {formatDate(settings?.build.lastTriggeredAt)}
            {settings?.build.lastTriggeredBy
              ? ` · ${settings.build.lastTriggeredBy}`
              : ""}
          </p>
        </section>

        <section className="card">
          <h2>Historial de versiones</h2>
          {releases.length === 0 ? (
            <p className="empty">Todavía no hay versiones publicadas desde el panel.</p>
          ) : (
            <ul className="release-list">
              {releases.map((release) => (
                <li key={release.id}>
                  <strong>{release.version}</strong>
                  <span>{formatDate(release.released_at)}</span>
                  {release.notes && <small>{release.notes}</small>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="card">
        <h2>Seguridad</h2>
        <p className="muted">Cambia la contraseña del administrador.</p>
        <form onSubmit={changePassword} className="form-grid form-grid--3">
          <label className="field">
            <span>Contraseña actual</span>
            <input
              type="password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <label className="field">
            <span>Nueva contraseña</span>
            <input
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <label className="field">
            <span>Confirmar nueva contraseña</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          <button
            type="submit"
            className="btn btn--ghost"
            disabled={changingPassword}
          >
            {changingPassword ? "Cambiando…" : "Cambiar contraseña"}
          </button>
        </form>
      </section>
    </div>
  );
}
