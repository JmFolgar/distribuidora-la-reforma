import { useEffect } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useNavigate,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./auth/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import RoleRoute from "./components/RoleRoute";
import LoginPage from "./pages/LoginPage";
import MenuPage from "./pages/MenuPage";
import UsuariosPage from "./pages/UsuariosPage";
import ClientesPage from "./pages/ClientesPage";
import ProductosPage from "./pages/ProductosPage";
import ProveedoresPage from "./pages/ProveedoresPage";
import "./App.css";

/**
 * Si el usuario cierra sesión y usa «atrás», fuerza el login
 * cuando ya no hay sesión activa.
 */
function HistoryGuard() {
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    function onPopState() {
      if (!loading && !isAuthenticated) {
        navigate("/login", { replace: true });
      }
    }

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [isAuthenticated, loading, navigate]);

  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <HistoryGuard />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/menu"
            element={
              <ProtectedRoute>
                <MenuPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/usuarios"
            element={
              <ProtectedRoute>
                <RoleRoute roles={["ADMINISTRADOR"]}>
                  <UsuariosPage />
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/clientes"
            element={
              <ProtectedRoute>
                <RoleRoute
                  roles={["ADMINISTRADOR", "SUPERVISOR", "OPERADOR"]}
                >
                  <ClientesPage />
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/productos"
            element={
              <ProtectedRoute>
                <RoleRoute
                  roles={["ADMINISTRADOR", "SUPERVISOR", "OPERADOR"]}
                >
                  <ProductosPage />
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route
            path="/proveedores"
            element={
              <ProtectedRoute>
                <RoleRoute roles={["ADMINISTRADOR", "SUPERVISOR"]}>
                  <ProveedoresPage />
                </RoleRoute>
              </ProtectedRoute>
            }
          />
          <Route path="/" element={<Navigate to="/menu" replace />} />
          <Route path="*" element={<Navigate to="/menu" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
