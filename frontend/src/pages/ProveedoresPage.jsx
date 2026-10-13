import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Search, UserCheck, UserX } from "lucide-react";
import AppShell from "../layout/AppShell";
import { useAuth } from "../auth/AuthContext";
import {
  activarProveedor,
  createProveedor,
  desactivarProveedor,
  listProveedores,
} from "../api/client";
import {
  correoValido,
  nitValido,
  nombrePersonaValido,
  telefonoValido,
} from "../utils/validacion";

const EMPTY_FORM = {
  nombre: "",
  nit: "",
  telefono: "",
  correo: "",
  personaContacto: "",
};

function validarFormulario(form) {
  const fields = {};
  if (!form.nombre.trim()) fields.nombre = "El nombre es obligatorio";
  else if (!nombrePersonaValido(form.nombre)) {
    fields.nombre = "El nombre solo puede incluir letras";
  }
  if (
    form.personaContacto.trim() &&
    !nombrePersonaValido(form.personaContacto)
  ) {
    fields.personaContacto = "El nombre solo puede incluir letras";
  }
  if (!form.nit.trim()) fields.nit = "El NIT es obligatorio";
  else if (!nitValido(form.nit)) {
    fields.nit = "El NIT solo puede incluir letras, números y un guion";
  }
  if (form.telefono.trim() && !telefonoValido(form.telefono)) {
    fields.telefono = "El teléfono debe tener 8 dígitos";
  }
  if (form.correo.trim() && !correoValido(form.correo.trim())) {
    fields.correo = "Correo inválido";
  }
  return fields;
}

export default function ProveedoresPage() {
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === "ADMINISTRADOR";

  const [proveedores, setProveedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [accionId, setAccionId] = useState(null);
  const [busqueda, setBusqueda] = useState("");

  const proveedoresFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return proveedores;
    return proveedores.filter(
      (p) =>
        (p.nombre || "").toLowerCase().includes(q) ||
        (p.nit || "").toLowerCase().includes(q) ||
        (p.personaContacto || "").toLowerCase().includes(q)
    );
  }, [proveedores, busqueda]);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await listProveedores();
      setProveedores(res.data || []);
    } catch (err) {
      setError(err.message || "No se pudo cargar la lista de proveedores");
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
  }

  function cerrarModal(forzar = false) {
    if (guardando && !forzar) return;
    setModal(null);
    setEditando(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError("");
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
    const locals = validarFormulario(form);
    if (Object.keys(locals).length > 0) {
      setFieldErrors(locals);
      return;
    }

    setGuardando(true);
    try {
      await createProveedor({
        nombre: form.nombre.trim(),
        nit: form.nit.trim(),
        telefono: form.telefono.trim() || undefined,
        correo: form.correo.trim() || undefined,
        personaContacto: form.personaContacto.trim() || undefined,
      });
      setGuardando(false);
      cerrarModal(true);
      await cargar();
    } catch (err) {
      if (err.body?.fields) {
        setFieldErrors(err.body.fields);
      }
      setFormError(err.message || "No se pudo registrar el proveedor");
      setGuardando(false);
    }
  }

  function abrirDesactivar(proveedor) {
    setModal("desactivar");
    setEditando(proveedor);
    setFormError("");
  }

  async function confirmarDesactivar() {
    if (!editando) return;
    setAccionId(editando.id);
    setGuardando(true);
    setFormError("");
    try {
      await desactivarProveedor(editando.id);
      setGuardando(false);
      cerrarModal(true);
      await cargar();
    } catch (err) {
      setFormError(err.message || "No se pudo desactivar el proveedor");
      setGuardando(false);
    } finally {
      setAccionId(null);
    }
  }

  function abrirActivar(proveedor) {
    setModal("activar");
    setEditando(proveedor);
    setFormError("");
  }

  async function confirmarActivar() {
    if (!editando) return;
    setAccionId(editando.id);
    setGuardando(true);
    setFormError("");
    try {
      await activarProveedor(editando.id);
      setGuardando(false);
      cerrarModal(true);
      await cargar();
    } catch (err) {
      setFormError(err.message || "No se pudo activar el proveedor");
      setGuardando(false);
    } finally {
      setAccionId(null);
    }
  }

  return (
    <AppShell
      title="Proveedores"
      subtitle="Registra y administra proveedores para futuras órdenes de compra."
      actions={
        esAdmin ? (
          <button
            type="button"
            className="btn btn-primary btn-inline"
            onClick={abrirCrear}
          >
            <Plus size={16} strokeWidth={2} />
            Nuevo proveedor
          </button>
        ) : null
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
            placeholder="Buscar por nombre, NIT o contacto…"
            aria-label="Buscar proveedores"
          />
        </label>
        {!loading && (
          <span className="toolbar-meta">
            {proveedoresFiltrados.length} de {proveedores.length}
          </span>
        )}
      </div>

      <section className="card table-card">
        {loading ? (
          <p className="status-pending">
            <Loader2 size={16} className="spin" /> Cargando proveedores…
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>NIT</th>
                  <th>Teléfono</th>
                  <th>Correo</th>
                  <th>Contacto</th>
                  <th>Estado</th>
                  {esAdmin && <th>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {proveedoresFiltrados.map((p) => (
                  <tr key={p.id}>
                    <td><strong>{p.nombre}</strong></td>
                    <td className="mono">{p.nit}</td>
                    <td>{p.telefono || "—"}</td>
                    <td>{p.correo || "—"}</td>
                    <td>{p.personaContacto || "—"}</td>
                    <td>
                      <span
                        className={`badge ${p.activo ? "badge--success" : "badge--danger"}`}
                      >
                        {p.activo ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    {esAdmin && (
                      <td>
                        <div className="row-actions">
                          {p.activo ? (
                            <button
                              type="button"
                              className="btn-action btn-action--danger"
                              onClick={() => abrirDesactivar(p)}
                              disabled={accionId === p.id}
                              title="Desactivar"
                            >
                              <UserX size={14} strokeWidth={1.75} />
                              Desactivar
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn-action btn-action--success"
                              onClick={() => abrirActivar(p)}
                              disabled={accionId === p.id}
                              title="Activar"
                            >
                              <UserCheck size={14} strokeWidth={1.75} />
                              Activar
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {proveedoresFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={esAdmin ? 7 : 6} className="empty-cell">
                      {proveedores.length === 0
                        ? "No hay proveedores registrados."
                        : "No se encontraron proveedores con esa búsqueda."}
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
            className={`modal${modal === "crear" ? " modal--wide modal--fit" : ""}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="proveedores-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            {modal === "desactivar" || modal === "activar" ? (
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
                <h2 id="proveedores-modal-title">
                  {modal === "activar"
                    ? "Activar proveedor"
                    : "Desactivar proveedor"}
                </h2>
                <p className="page-subtitle">
                  {modal === "activar" ? (
                    <>
                      ¿Activar a <strong>{editando?.nombre}</strong>? Volverá a
                      aparecer al crear órdenes de compra.
                    </>
                  ) : (
                    <>
                      ¿Desactivar a <strong>{editando?.nombre}</strong>? Seguirá
                      en la lista como inactivo y no aparecerá al comprar.
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
                <h2 id="proveedores-modal-title">Nuevo proveedor</h2>
                <p className="page-subtitle">
                  Ingresa los datos del proveedor para registrarlo. El NIT no
                  puede repetirse.
                </p>

                <form
                  className="modal-form"
                  onSubmit={handleSubmit}
                  noValidate
                >
                  <label
                    className={`field ${fieldErrors.nombre ? "field--error" : ""}`}
                  >
                    <span>
                      Nombre
                      <span className="field-required" aria-hidden="true">
                        *
                      </span>
                    </span>
                    <input
                      name="nombre"
                      value={form.nombre}
                      onChange={onChange}
                      placeholder="Ej. Distribuidora Norte S.A."
                      autoComplete="organization"
                      maxLength={180}
                      disabled={guardando}
                      autoFocus
                      required
                      aria-required="true"
                    />
                    {fieldErrors.nombre && (
                      <em className="field-error">{fieldErrors.nombre}</em>
                    )}
                  </label>

                  <div className="form-grid-2">
                    <label
                      className={`field ${fieldErrors.nit ? "field--error" : ""}`}
                    >
                      <span>
                        NIT
                        <span className="field-required" aria-hidden="true">
                          *
                        </span>
                      </span>
                      <input
                        name="nit"
                        value={form.nit}
                        onChange={onChange}
                        placeholder="Ej. 1234567-8"
                        maxLength={20}
                        disabled={guardando}
                        required
                        aria-required="true"
                      />
                      {fieldErrors.nit && (
                        <em className="field-error">{fieldErrors.nit}</em>
                      )}
                    </label>

                    <label
                      className={`field ${fieldErrors.telefono ? "field--error" : ""}`}
                    >
                      <span>Teléfono</span>
                      <input
                        name="telefono"
                        type="tel"
                        value={form.telefono}
                        onChange={onChange}
                        placeholder="Ej. 5555-1234"
                        maxLength={30}
                        disabled={guardando}
                      />
                      {fieldErrors.telefono && (
                        <em className="field-error">{fieldErrors.telefono}</em>
                      )}
                    </label>
                  </div>

                  <label
                    className={`field ${fieldErrors.correo ? "field--error" : ""}`}
                  >
                    <span>Correo</span>
                    <input
                      type="email"
                      name="correo"
                      value={form.correo}
                      onChange={onChange}
                      placeholder="Ej. ventas@proveedor.com"
                      autoComplete="email"
                      maxLength={254}
                      disabled={guardando}
                    />
                    {fieldErrors.correo && (
                      <em className="field-error">{fieldErrors.correo}</em>
                    )}
                  </label>

                  <div className="form-section">
                    <p className="form-section__title">Persona de contacto</p>
                    <label
                      className={`field ${fieldErrors.personaContacto ? "field--error" : ""}`}
                    >
                      <span>Nombre del contacto</span>
                      <input
                        name="personaContacto"
                        value={form.personaContacto}
                        onChange={onChange}
                        placeholder="Ej. Juan Pérez"
                        maxLength={180}
                        disabled={guardando}
                      />
                      {fieldErrors.personaContacto && (
                        <em className="field-error">
                          {fieldErrors.personaContacto}
                        </em>
                      )}
                    </label>
                  </div>

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
