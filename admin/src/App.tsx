import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import { ToastProvider } from "./toast";
import Layout from "./components/Layout";
import Login from "./pages/Login";

// El login es la primera pantalla: va en el bundle inicial.
// El resto se descarga solo cuando el administrador abre cada sección.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Visits = lazy(() => import("./pages/Visits"));
const Products = lazy(() => import("./pages/Products"));
const ProductEdit = lazy(() => import("./pages/ProductEdit"));
const Categories = lazy(() => import("./pages/Categories"));
const Settings = lazy(() => import("./pages/Settings"));
const Activity = lazy(() => import("./pages/Activity"));

function LoadingScreen() {
  return (
    <div className="loading-screen">
      <div className="loading-mark">CB</div>
      <p>Cargando panel…</p>
    </div>
  );
}

function Shell() {
  const { user, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <Suspense fallback={<LoadingScreen />}>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="estadisticas" element={<Visits />} />
          <Route path="productos" element={<Products />} />
          <Route path="productos/nuevo" element={<ProductEdit />} />
          <Route path="productos/:id" element={<ProductEdit />} />
          <Route path="categorias" element={<Categories />} />
          <Route path="ajustes" element={<Settings />} />
          <Route path="actividad" element={<Activity />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter basename="/admin">
      <AuthProvider>
        <ToastProvider>
          <Shell />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
