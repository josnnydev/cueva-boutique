import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./auth";
import { ToastProvider } from "./toast";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Products from "./pages/Products";
import ProductEdit from "./pages/ProductEdit";
import Categories from "./pages/Categories";
import Settings from "./pages/Settings";
import Activity from "./pages/Activity";

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
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="productos" element={<Products />} />
        <Route path="productos/nuevo" element={<ProductEdit />} />
        <Route path="productos/:id" element={<ProductEdit />} />
        <Route path="categorias" element={<Categories />} />
        <Route path="ajustes" element={<Settings />} />
        <Route path="actividad" element={<Activity />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
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
