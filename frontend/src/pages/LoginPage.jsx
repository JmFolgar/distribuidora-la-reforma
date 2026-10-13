import { useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import {
  ClipboardList,
  Eye,
  EyeOff,
  Loader2,
  Package,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import NovaMark from "../components/NovaMark";
import loginIllustration from "../assets/login_patron_hexagonal_nova.svg";

const HIGHLIGHTS = [
  { icon: Package, text: "Inventario siempre al día" },
  { icon: ClipboardList, text: "Pedidos con seguimiento" },
  { icon: ShieldCheck, text: "Auditoría de cada acción" },
];

export default function LoginPage() {
  const { login, isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const [correo, setCorreo] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [mostrarClave, setMostrarClave] = useState(false);
  const [error, setError] = useState("");
  const [hintRecuperacion, setHintRecuperacion] = useState(false);
  const [enviando, setEnviando] = useState(false);

  if (!loading && isAuthenticated) {
    return <Navigate to="/menu" replace />;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setHintRecuperacion(false);

    const correoTrim = correo.trim();
    const sinCorreo = !correoTrim;
    const sinContrasena = !contrasena;

    if (sinCorreo && sinContrasena) {
      setError("Ingresa tu correo y tu contraseña");
      return;
    }
    if (sinCorreo) {
      setError("Ingresa tu correo");
      return;
    }
    if (sinContrasena) {
      setError("Ingresa tu contraseña");
      return;
    }

    setEnviando(true);

    try {
      await login(correoTrim, contrasena);
      navigate("/menu", { replace: true });
    } catch (err) {
      setError(err.message || "Correo o contraseña incorrectos");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="login-split">
      <aside className="login-hero">
        <p className="login-hero__name">Distribuidora La Reforma</p>

        <div className="login-hero__content">
          <div className="login-hero__copy">
            <p className="login-hero__eyebrow">Gestión comercial</p>
            <h1>Compra, controla y vende, todo en un solo lugar.</h1>
          </div>

          <ul className="login-hero__highlights">
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <li key={text}>
                <span className="login-hero__highlight-icon">
                  <Icon size={16} strokeWidth={1.75} />
                </span>
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="login-hero__art" aria-hidden="true">
          <img
            src={loginIllustration}
            alt=""
            className="login-hero__illustration"
          />
        </div>
      </aside>

      <main className="login-form-panel">
        <form className="login-card" onSubmit={handleSubmit} noValidate>
          <div className="login-card__brand">
            <NovaMark size={40} />
          </div>

          <div className="login-form__header">
            <h2>Iniciar sesión</h2>
            <p>Ingresa con tu correo y contraseña</p>
          </div>

          <label className="field">
            <span>Correo</span>
            <input
              type="email"
              name="correo"
              autoComplete="username"
              value={correo}
              onChange={(e) => {
                setCorreo(e.target.value);
                if (error) setError("");
              }}
              placeholder="correo@ejemplo.com"
              disabled={enviando}
            />
          </label>

          <label className="field">
            <span>Contraseña</span>
            <div className="field-password">
              <input
                type={mostrarClave ? "text" : "password"}
                name="contrasena"
                autoComplete="current-password"
                value={contrasena}
                onChange={(e) => {
                  setContrasena(e.target.value);
                  if (error) setError("");
                }}
                placeholder="••••••••"
                disabled={enviando}
              />
              <button
                type="button"
                className="field-password__toggle"
                onClick={() => setMostrarClave((v) => !v)}
                aria-label={
                  mostrarClave ? "Ocultar contraseña" : "Mostrar contraseña"
                }
                disabled={enviando}
              >
                {mostrarClave ? (
                  <EyeOff size={18} strokeWidth={1.75} />
                ) : (
                  <Eye size={18} strokeWidth={1.75} />
                )}
              </button>
            </div>
          </label>

          <div className="login-card__meta">
            <button
              type="button"
              className="link-muted"
              onClick={() => setHintRecuperacion(true)}
            >
              ¿Olvidaste tu contraseña?
            </button>
          </div>

          {hintRecuperacion && (
            <p className="form-hint" role="status">
              Contacta al administrador para restablecer tu acceso.
            </p>
          )}

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={enviando}
          >
            {enviando ? (
              <>
                <Loader2
                  size={16}
                  strokeWidth={2}
                  className="spin"
                  aria-hidden
                />
                Ingresando…
              </>
            ) : (
              "Iniciar sesión"
            )}
          </button>
        </form>
      </main>
    </div>
  );
}
