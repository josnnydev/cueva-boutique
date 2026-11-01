import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";

const items = [
  { to: "/", label: "Panel", end: true },
  { to: "/productos", label: "Productos" },
  { to: "/categorias", label: "Categorías" },
  { to: "/ajustes", label: "Ajustes" },
  { to: "/actividad", label: "Actividad" }
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  async function handleLogout() {
    await logout();
    navigate("/", { replace: true });
  }

  return (
    <div className="admin-shell">
      <button
        type="button"
        className="mobile-menu"
        aria-label="Abrir menú"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span />
        <span />
        <span />
      </button>

      {open && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Cerrar menú"
          onClick={() => setOpen(false)}
        />
      )}

      <aside className={`sidebar ${open ? "is-open" : ""}`}>
        <div className="sidebar__brand">
          <img src="/assets/img/logo-cueva.webp" alt="" width="48" height="56" />
          <div>
            <strong>Cueva Boutique</strong>
            <span>Panel de administración</span>
          </div>
        </div>

        <nav className="sidebar__nav" aria-label="Navegación del panel">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) => (isActive ? "is-active" : "")}
            >
              <span className="nav-dot" aria-hidden="true" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar__bottom">
          <a className="sidebar__store" href="/" target="_blank" rel="noopener noreferrer">
            Ver la tienda ↗
          </a>
          <div className="sidebar__user">
            <span>{user?.fullName || "Administrador"}</span>
            <small>{user?.email}</small>
          </div>
          <button type="button" className="btn btn--ghost btn--small" onClick={handleLogout}>
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
