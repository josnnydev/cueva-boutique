import { useCallback, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../api";
import { useAuth } from "../auth";
import { useToast } from "../toast";
import Turnstile, { TURNSTILE_ENABLED } from "../components/Turnstile";

export default function Login() {
  const { login } = useAuth();
  const { show } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleToken = useCallback((token: string) => {
    setCaptcha(token);
  }, []);

  const captchaReady = !TURNSTILE_ENABLED || captcha.length > 0;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (!captchaReady) {
      setError("Espera a que termine la verificación del captcha.");
      return;
    }

    setBusy(true);

    try {
      await login(email.trim(), password, {
        website: honeypot,
        turnstileToken: captcha || undefined
      });
      show("Bienvenido de nuevo.", "success");
      navigate("/", { replace: true });
    } catch (caught) {
      const message =
        caught instanceof ApiError
          ? caught.message
          : "No se pudo iniciar sesión. Revisa tu conexión.";
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <img src="/assets/img/logo-cueva.webp" alt="Cueva Boutique" width="76" height="88" />
          <p className="eyebrow">Cueva Boutique</p>
          <h1>Panel de administración</h1>
          <p className="login-copy">
            Gestiona productos, fotos, precios y ofertas de la tienda.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="form">
          {error && (
            <div className="alert alert--error" role="alert">
              {error}
            </div>
          )}

          <label className="field">
            <span>Correo electrónico</span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              required
              autoFocus
              placeholder="admin@cuevaboutique.com"
            />
          </label>

          <label className="field">
            <span>Contraseña</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
              minLength={6}
              placeholder="••••••••"
            />
          </label>

          <Turnstile onToken={handleToken} />

          {/* Campo trampa: invisible para personas, tentador para bots. */}
          <div className="hp-field" aria-hidden="true">
            <label htmlFor="login-website">No completar este campo</label>
            <input
              id="login-website"
              name="website"
              type="text"
              value={honeypot}
              onChange={(event) => setHoneypot(event.target.value)}
              tabIndex={-1}
              autoComplete="off"
            />
          </div>

          <button type="submit" className="btn btn--gold btn--full" disabled={busy}>
            {busy ? "Entrando…" : "Entrar al panel"}
          </button>

          {TURNSTILE_ENABLED && (
            <p className="field-hint">Protegido por Cloudflare Turnstile.</p>
          )}
        </form>

        <a className="login-back" href="/">
          ← Volver a la tienda
        </a>
      </div>
    </div>
  );
}
