import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import AppShell from "../layout/AppShell";
import { useAuth } from "../auth/AuthContext";
import { ETIQUETA_ROL, NAV_GROUPS } from "../config/navigation";
import { listRoles, listUsuarios, updateUsuario } from "../api/client";

const ORDEN_ROLES = ["ADMINISTRADOR", "SUPERVISOR", "OPERADOR"];

function modulosDeRol(rol) {
  return NAV_GROUPS.flatMap((grupo) => grupo.items)
    .filter((item) => !item.soon && item.roles.includes(rol))
    .map((item) => item.label);
}

export default function RolesPage() {
  const { usuario: sesion, refrescarUsuario } = useAuth();
  const [roles, setRoles] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [editando, setEditando] = useState(null);
  const [rolNuevo, setRolNuevo] = useState("");
  const [formError, setFormError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [rolFiltro, setRolFiltro] = useState("");

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [rolesRes, usuariosRes] = await Promise.all([listRoles(), listUsuarios()]);
      const lista = rolesRes.data || [];
      lista.sort(
        (a, b) =>
          (ORDEN_ROLES.indexOf(a.nombre) + 1 || 99) -
          (ORDEN_ROLES.indexOf(b.nombre) + 1 || 99)
      );
      setRoles(lista);
      setUsuarios(usuariosRes.data || []);
    } catch (err) {
      setError(err.message || "No se pudieron cargar los roles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function abrirCambio(usuario) {
    setEditando(usuario);
    setRolNuevo(usuario.rol || "OPERADOR");
    setFormError("");
    setAviso("");
  }

  function cerrar() {
    if (guardando) return;
    setEditando(null);
    setRolNuevo("");
    setFormError("");
  }

  async function guardar(event) {
    event.preventDefault();
    if (!editando) return;
    if (!rolNuevo) {
      setFormError("Seleccione un rol");
      return;
    }
    const rolesUsuario = editando.roles?.length ? editando.roles : editando.rol ? [editando.rol] : [];
    if (rolesUsuario.length === 1 && rolesUsuario[0] === rolNuevo) {
      setFormError("Ya tiene ese rol");
      return;
    }
    setGuardando(true);
    setFormError("");
    try {
      await updateUsuario(editando.id, {
        nombre: editando.nombre,
        rol: rolNuevo,
      });
      if (sesion?.id === editando.id) {
        await refrescarUsuario();
      }
      setAviso(
        `El rol de ${editando.nombre} quedó en ${ETIQUETA_ROL[rolNuevo] || rolNuevo}. Lo verá al volver a iniciar sesión.`
      );
      setGuardando(false);
      setEditando(null);
      await cargar();
    } catch (err) {
      setFormError(err.message || "No se pudo cambiar el rol");
      setGuardando(false);
    }
  }

  const consulta = busqueda.trim().toLowerCase();
  const hayFiltro = consulta.length > 0 || rolFiltro !== "";
  const coincidencias = useMemo(() => {
    if (!hayFiltro) return [];
    return usuarios.filter((usuario) => {
      const texto =
        !consulta ||
        (usuario.nombre || "").toLowerCase().includes(consulta) ||
        (usuario.correo || "").toLowerCase().includes(consulta) ||
        (usuario.nombreUsuario || "").toLowerCase().includes(consulta);
      const rol = !rolFiltro || usuario.rol === rolFiltro;
      return texto && rol;
    });
  }, [usuarios, consulta, rolFiltro, hayFiltro]);

  function limpiarFiltros() {
    setBusqueda("");
    setRolFiltro("");
  }

  return (
    <AppShell
      title="Roles y permisos"
      subtitle="Busca a la persona y elige su rol. El cambio se nota cuando vuelve a iniciar sesión."
    >
      {error && (
        <p className="form-error" role="alert" style={{ marginBottom: "1rem" }}>
          {error}
        </p>
      )}
      {aviso && (
        <p className="form-ok" role="status" style={{ marginBottom: "1rem" }}>
          {aviso}
        </p>
      )}

      {loading ? (
        <p className="status-pending">
          <Loader2 size={16} className="spin" /> Cargando roles…
        </p>
      ) : (
        <>
          <div className="toolbar">
            <label className="toolbar-search">
              <Search size={16} strokeWidth={1.75} aria-hidden />
              <input
                type="search"
                value={busqueda}
                onChange={(event) => setBusqueda(event.target.value)}
                placeholder="Buscar por nombre, correo o usuario…"
                aria-label="Buscar usuario"
              />
            </label>
            <select
              className="rol-filtro"
              value={rolFiltro}
              onChange={(event) => setRolFiltro(event.target.value)}
              aria-label="Filtrar por rol"
            >
              <option value="">Todos los roles</option>
              {roles.map((rol) => (
                <option key={rol.id} value={rol.nombre}>
                  {ETIQUETA_ROL[rol.nombre] || rol.nombre}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="mov-filtros__reset"
              disabled={!hayFiltro}
              onClick={limpiarFiltros}
            >
              Limpiar filtros
            </button>
          </div>

          {!hayFiltro && (
            <p className="rol-vacio" style={{ marginBottom: "1rem" }}>
              Escribe un nombre, correo o usuario, o elige un rol.
            </p>
          )}
          {hayFiltro && coincidencias.length === 0 && (
            <p className="rol-vacio" style={{ marginBottom: "1rem" }}>
              No hay resultados
            </p>
          )}
          {coincidencias.length > 0 && (
            <section className="card rol-card" style={{ marginBottom: "1rem" }}>
              <ul className="rol-personas">
                {coincidencias.map((usuario) => (
                  <li key={usuario.id}>
                    <div>
                      <strong>{usuario.nombre}</strong>
                      <span>
                        {usuario.correo}
                        {" · "}
                        {ETIQUETA_ROL[usuario.rol] || usuario.rol || "Sin rol"}
                      </span>
                    </div>
                    {!usuario.activo && <span className="badge badge--danger">Inactivo</span>}
                    <button
                      type="button"
                      className="btn-ghost btn-inline"
                      onClick={() => abrirCambio(usuario)}
                    >
                      Cambiar rol
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {!hayFiltro && (
          <div className="roles-lista">
            {roles.map((rol) => {
              const modulos = modulosDeRol(rol.nombre);
              return (
                <section key={rol.id} className="card rol-card">
                  <h2 className="card-title">{ETIQUETA_ROL[rol.nombre] || rol.nombre}</h2>
                  <p className="card-text">{rol.descripcion}</p>
                  <div
                    className="rol-modulos"
                    aria-label={`Módulos de ${ETIQUETA_ROL[rol.nombre] || rol.nombre}`}
                  >
                    {modulos.map((modulo) => (
                      <span key={modulo} className="rol-modulo">
                        {modulo}
                      </span>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
          )}
        </>
      )}

      {editando && (
        <div className="modal-backdrop" role="presentation" onClick={cerrar}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rol-modal-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id="rol-modal-title">Cambiar rol</h2>
            <p className="page-subtitle">
              <strong>{editando.nombre}</strong> entra hoy como{" "}
              {ETIQUETA_ROL[editando.rol] || editando.rol || "sin rol"}. El menú usa el rol nuevo
              cuando vuelva a iniciar sesión.
            </p>
            {editando.roles?.length > 1 && (
              <p className="page-subtitle">
                También tiene{" "}
                {editando.roles
                  .filter((rol) => rol !== editando.rol)
                  .map((rol) => ETIQUETA_ROL[rol] || rol)
                  .join(", ")}
                . Al guardar queda solo el rol que elijas.
              </p>
            )}
            <form className="modal-form" onSubmit={guardar} noValidate>
              <label className="field">
                <span>Rol</span>
                <select
                  value={rolNuevo}
                  onChange={(event) => {
                    setRolNuevo(event.target.value);
                    setFormError("");
                  }}
                  disabled={guardando}
                >
                  {roles.map((rol) => (
                    <option key={rol.id} value={rol.nombre}>
                      {ETIQUETA_ROL[rol.nombre] || rol.nombre}
                    </option>
                  ))}
                </select>
              </label>
              {formError && (
                <p className="form-error" role="alert">
                  {formError}
                </p>
              )}
              <div className="modal-actions">
                <button type="button" className="btn-ghost" onClick={cerrar} disabled={guardando}>
                  Cerrar
                </button>
                <button type="submit" className="btn-save" disabled={guardando}>
                  {guardando ? (
                    <>
                      <Loader2 size={16} className="spin" />
                      Guardando…
                    </>
                  ) : (
                    "Guardar"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
