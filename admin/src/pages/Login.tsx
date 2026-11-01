import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError } from "../api";
import { useAuth } from "../auth";
import { useToast } from "../toast";

export default function Login() {
  const { login } = useAuth();
  const { show } = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);

    try {
      await login(email.trim(), password);
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

          <button type="submit" className="btn btn--gold btn--full" disabled={busy}>
            {busy ? "Entrando…" : "Entrar al panel"}
          </button>
        </form>

        <a className="login-back" href="/">
          ← Volver a la tienda
        </a>
      </div>
    </div>
  );
}
