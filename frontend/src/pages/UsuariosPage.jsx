import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Eye,
  EyeOff,
  Filter,
  Loader2,
  KeyRound,
  Pencil,
  Plus,
  Search,
  UserCheck,
  UserX,
} from "lucide-react";
import AppShell from "../layout/AppShell";
import { useAuth } from "../auth/AuthContext";
import { ETIQUETA_ROL } from "../config/navigation";
import {
  activarUsuario,
  createUsuario,
  desactivarUsuario,
  listRoles,
  listUsuarios,
  restablecerContrasena,
  updateUsuario,
} from "../api/client";
import {
  contrasenaValida,
  correoValido,
  MENSAJE_CONTRASENA,
  nombrePersonaValido,
} from "../utils/validacion";

const EMPTY_FORM = {
  nombre: "",
  correo: "",
  contrasena: "",
  rol: "OPERADOR",
};

function validarFormulario(form, modo) {
  const fields = {};
  if (!form.nombre.trim()) fields.nombre = "El nombre es obligatorio";
  else if (!nombrePersonaValido(form.nombre)) {
    fields.nombre = "El nombre solo puede incluir letras";
  }
  if (!form.rol) fields.rol = "Seleccione un rol";
  if (modo === "crear") {
    if (!form.correo.trim()) fields.correo = "El correo es obligatorio";
    else if (!correoValido(form.correo)) fields.correo = "Correo inválido";
    if (!form.contrasena) fields.contrasena = "La contraseña es obligatoria";
    else if (!contrasenaValida(form.contrasena)) {
      fields.contrasena = MENSAJE_CONTRASENA;
    }
  }
  return fields;
}

export default function UsuariosPage() {
  const { usuario: sesion, refrescarUsuario } = useAuth();
  const [usuarios, setUsuarios] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null); // 'crear' | 'editar' | 'desactivar' | 'activar' | null
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [accionId, setAccionId] = useState(null);
  const [busqueda, setBusqueda] = useState("");
  const [rolesFiltro, setRolesFiltro] = useState([]);
  const [filtroAbierto, setFiltroAbierto] = useState(false);
  const [mostrarClave, setMostrarClave] = useState(false);
  const [aviso, setAviso] = useState("");

  const usuariosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return usuarios.filter((u) => {
      const coincideTexto =
        !q ||
        (u.nombre || "").toLowerCase().includes(q) ||
        (u.correo || "").toLowerCase().includes(q) ||
        (u.nombreUsuario || "").toLowerCase().includes(q);

      const coincideRol =
        rolesFiltro.length === 0 || rolesFiltro.includes(u.rol);

      return coincideTexto && coincideRol;
    });
  }, [usuarios, busqueda, rolesFiltro]);

  function toggleRolFiltro(nombreRol) {
    setRolesFiltro((prev) =>
      prev.includes(nombreRol)
        ? prev.filter((r) => r !== nombreRol)
        : [...prev, nombreRol]
    );
  }

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [usuariosRes, rolesRes] = await Promise.all([
        listUsuarios(),
        listRoles(),
      ]);
      setUsuarios(usuariosRes.data || []);
      setRoles(rolesRes.data || []);
    } catch (err) {
      setError(err.message || "No se pudo cargar la lista de usuarios");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function abrirCrear() {
    setModal("crear");
    setEditando(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError("");
    setMostrarClave(false);
  }

  function abrirEditar(usuario) {
    setModal("editar");
    setEditando(usuario);
    setForm({
      ...EMPTY_FORM,
      nombre: usuario.nombre || "",
      rol: usuario.rol || "OPERADOR",
    });
    setFieldErrors({});
    setFormError("");
  }

  function cerrarModal(forzar = false) {
    if (guardando && !forzar) return;
    setModal(null);
    setEditando(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError("");
    setMostrarClave(false);
  }

  function onChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
    setFormError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError("");
    const locals = validarFormulario(form, modal);
    if (Object.keys(locals).length > 0) {
      setFieldErrors(locals);
      return;
    }

    setGuardando(true);
    try {
      if (modal === "crear") {
        await createUsuario({
          nombre: form.nombre.trim(),
          correo: form.correo.trim(),
          contrasena: form.contrasena,
          rol: form.rol,
        });
      } else {
        await updateUsuario(editando.id, {
          nombre: form.nombre.trim(),
          rol: form.rol,
        });
        if (sesion?.id === editando.id) {
          await refrescarUsuario();
        }
      }
      setGuardando(false);
      cerrarModal(true);
      await cargar();
    } catch (err) {
      if (err.body?.fields) {
        setFieldErrors(err.body.fields);
      }
      setFormError(err.message || "No se pudo guardar el usuario");
      setGuardando(false);
    }
  }

  function abrirRestablecer(usuario) {
    setModal("restablecer");
    setEditando(usuario);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError("");
    setMostrarClave(false);
    setAviso("");
  }

  async function confirmarRestablecer(e) {
    e.preventDefault();
    if (!editando) return;
    setFormError("");
    if (!form.contrasena) {
      setFieldErrors({ contrasena: "La contraseña es obligatoria" });
      return;
    }
    if (!contrasenaValida(form.contrasena)) {
      setFieldErrors({ contrasena: MENSAJE_CONTRASENA });
      return;
    }
    setGuardando(true);
    try {
      await restablecerContrasena(editando.id, form.contrasena);
      window.dispatchEvent(new Event("claves-alertas"));
      setAviso(`La contraseña de ${editando.nombre} quedó restablecida.`);
      setGuardando(false);
      cerrarModal(true);
    } catch (err) {
      if (err.body?.fields) setFieldErrors(err.body.fields);
      setFormError(err.message || "No se pudo restablecer la contraseña");
      setGuardando(false);
    }
  }

  function abrirDesactivar(usuario) {
    setModal("desactivar");
    setEditando(usuario);
    setFormError("");
  }

  async function confirmarDesactivar() {
    if (!editando) return;
    setAccionId(editando.id);
    setGuardando(true);
    setFormError("");
    try {
      await desactivarUsuario(editando.id);
      setGuardando(false);
      cerrarModal(true);
      await cargar();
    } catch (err) {
      setFormError(err.message || "No se pudo desactivar el usuario");
      setGuardando(false);
    } finally {
      setAccionId(null);
    }
  }

  function abrirActivar(usuario) {
    setModal("activar");
    setEditando(usuario);
    setFormError("");
  }

  async function confirmarActivar() {
    if (!editando) return;
    setAccionId(editando.id);
    setGuardando(true);
    setFormError("");
    try {
      await activarUsuario(editando.id);
      setGuardando(false);
      cerrarModal(true);
      await cargar();
    } catch (err) {
      setFormError(err.message || "No se pudo activar el usuario");
      setGuardando(false);
    } finally {
      setAccionId(null);
    }
  }

  return (
    <AppShell
      title="Usuarios"
      subtitle="Administra las cuentas del equipo y controla quién puede acceder al sistema."
      actions={
        <button type="button" className="btn btn-primary btn-inline" onClick={abrirCrear}>
          <Plus size={16} strokeWidth={2} />
          Nuevo usuario
        </button>
      }
    >
      {error && (
        <p className="form-error" role="alert" style={{ marginBottom: "1rem" }}>
          {error}
        </p>
      )}

      <div className="toolbar">
        <label className="toolbar-search">
          <Search size={16} strokeWidth={1.75} aria-hidden />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, correo o usuario…"
            aria-label="Buscar usuarios"
          />
        </label>

        <div className="filter-dropdown">
          <button
            type="button"
            className={`filter-dropdown__trigger ${filtroAbierto ? "is-open" : ""} ${rolesFiltro.length > 0 ? "has-filters" : ""}`}
            onClick={() => setFiltroAbierto((v) => !v)}
            aria-expanded={filtroAbierto}
            aria-haspopup="true"
            aria-label="Filtrar por rol"
            title="Filtrar por rol"
          >
            <Filter size={16} strokeWidth={1.75} />
            {rolesFiltro.length > 0 && (
              <span className="filter-dropdown__badge">{rolesFiltro.length}</span>
            )}
          </button>

          {filtroAbierto && (
            <>
              <button
                type="button"
                className="filter-dropdown__scrim"
                aria-label="Cerrar filtro"
                onClick={() => setFiltroAbierto(false)}
              />
              <div className="filter-dropdown__menu" role="group" aria-label="Filtrar por rol">
                {roles.map((r) => (
                  <label key={r.id} className="filter-check filter-check--menu">
                    <input
                      type="checkbox"
                      checked={rolesFiltro.includes(r.nombre)}
                      onChange={() => toggleRolFiltro(r.nombre)}
                    />
                    <span>{ETIQUETA_ROL[r.nombre] || r.nombre}</span>
                  </label>
                ))}
                {rolesFiltro.length > 0 && (
                  <button
                    type="button"
                    className="filter-dropdown__clear"
                    onClick={() => setRolesFiltro([])}
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {!loading && (
          <span className="toolbar-meta">
            {usuariosFiltrados.length} de {usuarios.length}
          </span>
        )}
      </div>

      {aviso && (
        <p className="form-ok" role="status" style={{ marginBottom: "1rem" }}>
          {aviso}
        </p>
      )}

      <section className="card table-card">
        {loading ? (
          <p className="status-pending">
            <Loader2 size={16} className="spin" /> Cargando usuarios…
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Correo</th>
                  <th>Rol</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {usuariosFiltrados.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.nombre}</strong>
                      <div className="cell-muted mono">{u.nombreUsuario}</div>
                    </td>
                    <td>{u.correo}</td>
                    <td>{ETIQUETA_ROL[u.rol] || u.rol || "—"}</td>
                    <td>
                      <span
                        className={`badge ${u.activo ? "badge--success" : "badge--danger"}`}
                      >
                        {u.activo ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn-action btn-action--neutral"
                          onClick={() => abrirRestablecer(u)}
                          title="Restablecer contraseña"
                        >
                          <KeyRound size={14} strokeWidth={1.75} />
                          Restablecer
                        </button>
                        <button
                          type="button"
                          className="btn-action btn-action--edit"
                          onClick={() => abrirEditar(u)}
                          title="Editar nombre"
                        >
                          <Pencil size={14} strokeWidth={1.75} />
                          Editar
                        </button>
                        {u.activo ? (
                          <button
                            type="button"
                            className="btn-action btn-action--danger"
                            onClick={() => abrirDesactivar(u)}
                            disabled={accionId === u.id}
                            title="Desactivar"
                          >
                            <UserX size={14} strokeWidth={1.75} />
                            Desactivar
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn-action btn-action--success"
                            onClick={() => abrirActivar(u)}
                            disabled={accionId === u.id}
                            title="Activar"
                          >
                            <UserCheck size={14} strokeWidth={1.75} />
                            Activar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {usuariosFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={5} className="empty-cell">
                      {usuarios.length === 0
                        ? "No hay usuarios registrados."
                        : "No se encontraron usuarios con esa búsqueda."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modal && (
        <div className="modal-backdrop" role="presentation" onClick={cerrarModal}>
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="usuarios-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            {modal === "restablecer" ? (
              <>
                <h2 id="usuarios-modal-title">Restablecer contraseña</h2>
                <p className="page-subtitle">
                  Escribe la nueva contraseña de <strong>{editando?.nombre}</strong>.
                  Avísale para que pueda entrar. La alerta de la campana se quita al guardar.
                </p>
                <form className="modal-form" onSubmit={confirmarRestablecer} noValidate>
                  <label className={`field ${fieldErrors.contrasena ? "field--error" : ""}`}>
                    <span>Nueva contraseña</span>
                    <div className="field-password">
                      <input
                        type={mostrarClave ? "text" : "password"}
                        name="contrasena"
                        value={form.contrasena}
                        onChange={onChange}
                        placeholder="Mín. 8, mayúscula, número y símbolo"
                        disabled={guardando}
                        autoComplete="new-password"
                        autoFocus
                      />
                      <button
                        type="button"
                        className="field-password__toggle"
                        onClick={() => setMostrarClave((v) => !v)}
                        aria-label={mostrarClave ? "Ocultar contraseña" : "Mostrar contraseña"}
                        disabled={guardando}
                      >
                        {mostrarClave ? (
                          <EyeOff size={18} strokeWidth={1.75} />
                        ) : (
                          <Eye size={18} strokeWidth={1.75} />
                        )}
                      </button>
                    </div>
                    {fieldErrors.contrasena && (
                      <em className="field-error">{fieldErrors.contrasena}</em>
                    )}
                  </label>
                  {formError && (
                    <p className="form-error" role="alert">
                      {formError}
                    </p>
                  )}
                  <div className="modal-actions">
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => cerrarModal()}
                      disabled={guardando}
                    >
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
              </>
            ) : modal === "desactivar" || modal === "activar" ? (
              <>
                <div
                  className={`modal-confirm-icon ${modal === "activar" ? "modal-confirm-icon--success" : ""}`}
                  aria-hidden="true"
                >
                  {modal === "activar" ? (
                    <UserCheck size={22} strokeWidth={1.75} />
                  ) : (
                    <UserX size={22} strokeWidth={1.75} />
                  )}
                </div>
                <h2 id="usuarios-modal-title">
                  {modal === "activar" ? "Activar usuario" : "Desactivar usuario"}
                </h2>
                <p className="page-subtitle">
                  {modal === "activar" ? (
                    <>
                      ¿Activar a <strong>{editando?.nombre}</strong>? Podrá
                      iniciar sesión de nuevo con su correo y contraseña.
                    </>
                  ) : (
                    <>
                      ¿Desactivar a <strong>{editando?.nombre}</strong>? Ya no
                      podrá iniciar sesión y seguirá visible en la lista como
                      inactivo.
                    </>
                  )}
                </p>

                {formError && (
                  <p className="form-error" role="alert">
                    {formError}
                  </p>
                )}

                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={cerrarModal}
                    disabled={guardando}
                  >
                    Cancelar
                  </button>
                  {modal === "activar" ? (
                    <button
                      type="button"
                      className="btn btn-success btn-inline"
                      onClick={confirmarActivar}
                      disabled={guardando}
                    >
                      {guardando ? (
                        <>
                          <Loader2 size={16} className="spin" />
                          Activando…
                        </>
                      ) : (
                        "Activar"
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-danger btn-inline"
                      onClick={confirmarDesactivar}
                      disabled={guardando}
                    >
                      {guardando ? (
                        <>
                          <Loader2 size={16} className="spin" />
                          Desactivando…
                        </>
                      ) : (
                        "Desactivar"
                      )}
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <h2 id="usuarios-modal-title">
                  {modal === "crear" ? "Nuevo usuario" : "Editar usuario"}
                </h2>
                <p className="page-subtitle">
                  {modal === "crear"
                    ? "Nombre, correo, contraseña y rol son obligatorios."
                    : "Actualiza el nombre y el rol. El cambio de rol aplica al volver a iniciar sesión."}
                </p>

                <form className="modal-form" onSubmit={handleSubmit} noValidate>
                  <label
                    className={`field ${fieldErrors.nombre ? "field--error" : ""}`}
                  >
                    <span>Nombre</span>
                    <input
                      name="nombre"
                      value={form.nombre}
                      onChange={onChange}
                      placeholder="Nombre y apellido"
                      disabled={guardando}
                      autoFocus
                    />
                    {fieldErrors.nombre && (
                      <em className="field-error">{fieldErrors.nombre}</em>
                    )}
                  </label>

                  {modal === "crear" && (
                    <>
                      <label
                        className={`field ${fieldErrors.correo ? "field--error" : ""}`}
                      >
                        <span>Correo</span>
                        <input
                          type="email"
                          name="correo"
                          value={form.correo}
                          onChange={onChange}
                          placeholder="correo@empresa.com"
                          disabled={guardando}
                        />
                        {fieldErrors.correo && (
                          <em className="field-error">{fieldErrors.correo}</em>
                        )}
                      </label>

                      <label
                        className={`field ${fieldErrors.contrasena ? "field--error" : ""}`}
                      >
                        <span>Contraseña</span>
                        <div className="field-password">
                          <input
                            type={mostrarClave ? "text" : "password"}
                            name="contrasena"
                            value={form.contrasena}
                            onChange={onChange}
                            placeholder="Mín. 8, mayúscula, número y símbolo"
                            disabled={guardando}
                            autoComplete="new-password"
                          />
                          <button
                            type="button"
                            className="field-password__toggle"
                            onClick={() => setMostrarClave((v) => !v)}
                            aria-label={
                              mostrarClave
                                ? "Ocultar contraseña"
                                : "Mostrar contraseña"
                            }
                            disabled={guardando}
                          >
                            {mostrarClave ? (
                              <EyeOff size={18} strokeWidth={1.75} />
                            ) : (
                              <Eye size={18} strokeWidth={1.75} />
                            )}
                          </button>
                        </div>
                        {fieldErrors.contrasena && (
                          <em className="field-error">
                            {fieldErrors.contrasena}
                          </em>
                        )}
                      </label>
                    </>
                  )}

                  <label
                    className={`field ${fieldErrors.rol ? "field--error" : ""}`}
                  >
                    <span>Rol</span>
                    <select
                      name="rol"
                      value={form.rol}
                      onChange={onChange}
                      disabled={guardando}
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.nombre}>
                          {ETIQUETA_ROL[r.nombre] || r.nombre}
                        </option>
                      ))}
                    </select>
                    {fieldErrors.rol && (
                      <em className="field-error">{fieldErrors.rol}</em>
                    )}
                  </label>

                  {formError && (
                    <p className="form-error" role="alert">
                      {formError}
                    </p>
                  )}

                  <div className="modal-actions">
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={cerrarModal}
                      disabled={guardando}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary btn-inline"
                      disabled={guardando}
                    >
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
              </>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
