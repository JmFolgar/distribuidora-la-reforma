import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Search,
} from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import NovaMark from "../components/NovaMark";
import { ETIQUETA_ROL, menuParaRol } from "../config/navigation";

export default function AppShell({ children, title, subtitle, actions }) {
  const { usuario, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [menuUserOpen, setMenuUserOpen] = useState(false);
  const groups = menuParaRol(usuario?.rol);
  const iniciales = (usuario?.nombreCompleto || "U")
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  async function handleLogout() {
    setMenuUserOpen(false);
    await logout();
    navigate("/login", { replace: true });
    window.history.pushState(null, "", "/login");
    window.history.replaceState(null, "", "/login");
  }

  return (
    <div className={`shell ${collapsed ? "shell--collapsed" : ""}`}>
      <aside className="sidebar" aria-label="Menú principal">
        <div className="sidebar__brand">
          <NovaMark size={36} />
          {!collapsed && (
            <div className="sidebar__brand-text">
              <strong>Distribuidora La Reforma</strong>
              <span>Panel de gestión</span>
            </div>
          )}
        </div>

        <nav className="sidebar__nav">
          {groups.map((group) => (
            <div key={group.id} className="nav-group">
              {!collapsed && (
                <p className="nav-group__label">{group.label}</p>
              )}
              <ul>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <li key={item.id}>
                      <NavLink
                        to={item.soon ? "#" : item.path}
                        end={item.path === "/menu"}
                        className={({ isActive }) =>
                          `nav-item ${isActive && !item.soon ? "nav-item--active" : ""} ${item.soon ? "nav-item--soon" : ""}`
                        }
                        title={
                          item.soon
                            ? `${item.label} (próximamente)`
                            : item.label
                        }
                        onClick={(e) => {
                          if (item.soon) e.preventDefault();
                        }}
                      >
                        <Icon size={18} strokeWidth={1.75} />
                        {!collapsed && <span>{item.label}</span>}
                      </NavLink>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <button
          type="button"
          className="sidebar__collapse"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
        >
          {collapsed ? (
            <ChevronRight size={16} strokeWidth={1.75} />
          ) : (
            <>
              <ChevronLeft size={16} strokeWidth={1.75} />
              <span>Colapsar</span>
            </>
          )}
        </button>
      </aside>

      <div className="shell__main">
        <header className="topbar">
          <div className="topbar__search">
            <Search size={16} strokeWidth={1.75} />
            <input
              type="search"
              placeholder="Buscar…"
              aria-label="Búsqueda global"
              disabled
            />
          </div>

          <div className="topbar__actions">
            <button
              type="button"
              className="icon-btn"
              aria-label="Alertas"
              title="Alertas (próximamente)"
            >
              <Bell size={18} strokeWidth={1.75} />
            </button>

            <div className="user-menu">
              <button
                type="button"
                className="user-chip"
                onClick={() => setMenuUserOpen((v) => !v)}
                aria-expanded={menuUserOpen}
              >
                <span className="avatar">{iniciales}</span>
                <span className="user-chip__meta">
                  <strong>{usuario?.nombreCompleto}</strong>
                  <span>{ETIQUETA_ROL[usuario?.rol] || usuario?.rol}</span>
                </span>
              </button>

              {menuUserOpen && (
                <div className="user-dropdown" role="menu">
                  <p className="user-dropdown__email">{usuario?.correo}</p>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={handleLogout}
                  >
                    <LogOut size={16} strokeWidth={1.75} />
                    Cerrar sesión
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="content">
          {(title || actions) && (
            <div className="content__header">
              <div>
                {title && <h1 className="page-title">{title}</h1>}
                {subtitle && <p className="page-subtitle">{subtitle}</p>}
              </div>
              {actions && <div className="content__actions">{actions}</div>}
            </div>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
