import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Search } from "lucide-react";
import AppShell from "../layout/AppShell";
import { useAuth } from "../auth/AuthContext";
import {
  createCliente,
  listClientes,
  listDepartamentos,
  listMunicipios,
  updateCliente,
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
  idDepartamento: "",
  idMunicipio: "",
  zona: "",
  colonia: "",
  calle: "",
  avenida: "",
  numeroCasa: "",
  referencia: "",
};

function tieneDetalleDireccion(form) {
  return Boolean(
    form.zona.trim() ||
      form.colonia.trim() ||
      form.calle.trim() ||
      form.avenida.trim() ||
      form.numeroCasa.trim() ||
      form.referencia.trim()
  );
}

function validarFormulario(form) {
  const fields = {};
  if (!form.nombre.trim()) fields.nombre = "El nombre es obligatorio";
  else if (!nombrePersonaValido(form.nombre)) {
    fields.nombre = "El nombre solo puede incluir letras";
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
  if (tieneDetalleDireccion(form) && !form.idMunicipio) {
    fields.idMunicipio = "Seleccione un municipio para la dirección";
  }
  return fields;
}

function formDesdeCliente(cliente) {
  return {
    nombre: cliente.nombre || "",
    nit: cliente.nit || "",
    telefono: cliente.telefono || "",
    correo: cliente.correo || "",
    idDepartamento: cliente.idDepartamento
      ? String(cliente.idDepartamento)
      : "",
    idMunicipio: cliente.idMunicipio ? String(cliente.idMunicipio) : "",
    zona: cliente.zona || "",
    colonia: cliente.colonia || "",
    calle: cliente.calle || "",
    avenida: cliente.avenida || "",
    numeroCasa: cliente.numeroCasa || "",
    referencia: cliente.referencia || "",
  };
}

function payloadDesdeForm(form) {
  return {
    nombre: form.nombre.trim(),
    nit: form.nit.trim(),
    telefono: form.telefono.trim() || undefined,
    correo: form.correo.trim() || undefined,
    idMunicipio: form.idMunicipio ? Number(form.idMunicipio) : undefined,
    zona: form.zona.trim() || undefined,
    colonia: form.colonia.trim() || undefined,
    calle: form.calle.trim() || undefined,
    avenida: form.avenida.trim() || undefined,
    numeroCasa: form.numeroCasa.trim() || undefined,
    referencia: form.referencia.trim() || undefined,
  };
}

export default function ClientesPage() {
  const { usuario } = useAuth();
  const puedeEscribir =
    usuario?.rol === "ADMINISTRADOR" || usuario?.rol === "OPERADOR";

  const [clientes, setClientes] = useState([]);
  const [departamentos, setDepartamentos] = useState([]);
  const [municipios, setMunicipios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cargandoMunicipios, setCargandoMunicipios] = useState(false);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null); // 'crear' | 'editar' | null
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  const clientesFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return clientes;
    return clientes.filter(
      (c) =>
        (c.nombre || "").toLowerCase().includes(q) ||
        (c.nit || "").toLowerCase().includes(q)
    );
  }, [clientes, busqueda]);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [clientesRes, depsRes] = await Promise.all([
        listClientes(),
        listDepartamentos(),
      ]);
      setClientes(clientesRes.data || []);
      setDepartamentos(depsRes.data || []);
    } catch (err) {
      setError(err.message || "No se pudo cargar la lista de clientes");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    let cancelled = false;

    async function cargarMunicipios() {
      if (!form.idDepartamento) {
        setMunicipios([]);
        return;
      }
      setCargandoMunicipios(true);
      try {
        const res = await listMunicipios(form.idDepartamento);
        if (!cancelled) setMunicipios(res.data || []);
      } catch {
        if (!cancelled) setMunicipios([]);
      } finally {
        if (!cancelled) setCargandoMunicipios(false);
      }
    }

    cargarMunicipios();
    return () => {
      cancelled = true;
    };
  }, [form.idDepartamento]);

  async function abrirCrear() {
    setModal("crear");
    setEditando(null);
    setForm(EMPTY_FORM);
    setMunicipios([]);
    setFieldErrors({});
    setFormError("");
    try {
      const depsRes = await listDepartamentos();
      setDepartamentos(depsRes.data || []);
    } catch {
      /* keep existing */
    }
  }

  async function abrirEditar(cliente) {
    setModal("editar");
    setEditando(cliente);
    setForm(formDesdeCliente(cliente));
    setFieldErrors({});
    setFormError("");
    try {
      const depsRes = await listDepartamentos();
      setDepartamentos(depsRes.data || []);
    } catch {
      /* keep existing */
    }
  }

  function cerrarModal(forzar = false) {
    if (guardando && !forzar) return;
    setModal(null);
    setEditando(null);
    setForm(EMPTY_FORM);
    setMunicipios([]);
    setFieldErrors({});
    setFormError("");
  }

  function onChange(e) {
    const { name, value } = e.target;
    setForm((prev) => {
      if (name === "idDepartamento") {
        return { ...prev, idDepartamento: value, idMunicipio: "" };
      }
      return { ...prev, [name]: value };
    });
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[name];
      if (name === "idDepartamento") delete next.idMunicipio;
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
      const payload = payloadDesdeForm(form);
      if (modal === "crear") {
        await createCliente(payload);
      } else {
        await updateCliente(editando.id, payload);
      }
      setGuardando(false);
      cerrarModal(true);
      await cargar();
    } catch (err) {
      if (err.body?.fields) {
        setFieldErrors(err.body.fields);
      }
      setFormError(
        err.message ||
          (modal === "crear"
            ? "No se pudo registrar el cliente"
            : "No se pudo actualizar el cliente")
      );
      setGuardando(false);
    }
  }

  return (
    <AppShell
      title="Clientes"
      subtitle={
        puedeEscribir
          ? "Consulta y actualiza clientes. Busca por nombre o NIT."
          : "Consulta la lista de clientes. Busca por nombre o NIT."
      }
      actions={
        puedeEscribir ? (
          <button
            type="button"
            className="btn btn-primary btn-inline"
            onClick={abrirCrear}
          >
            <Plus size={16} strokeWidth={2} />
            Nuevo cliente
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
            placeholder="Buscar por nombre o NIT…"
            aria-label="Buscar clientes por nombre o NIT"
          />
        </label>

        {!loading && (
          <span className="toolbar-meta">
            {clientesFiltrados.length} de {clientes.length}
          </span>
        )}
      </div>

      <section className="card table-card">
        {loading ? (
          <p className="status-pending">
            <Loader2 size={16} className="spin" /> Cargando clientes…
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
                  <th>Dirección</th>
                  {puedeEscribir && <th>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {clientesFiltrados.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.nombre}</strong>
                    </td>
                    <td className="mono cell-nowrap">{c.nit || "—"}</td>
                    <td className="cell-nowrap">{c.telefono || "—"}</td>
                    <td>{c.correo || "—"}</td>
                    <td>{c.direccion || "—"}</td>
                    {puedeEscribir && (
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="btn-action btn-action--edit"
                            onClick={() => abrirEditar(c)}
                            title="Editar cliente"
                          >
                            <Pencil size={14} strokeWidth={1.75} />
                            Editar
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {clientesFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={puedeEscribir ? 6 : 5} className="empty-cell">
                      {clientes.length === 0
                        ? "No hay clientes registrados."
                        : "No se encontraron clientes con esa búsqueda."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modal && puedeEscribir && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => cerrarModal()}
        >
          <div
            className="modal modal--wide modal--fit"
            role="dialog"
            aria-modal="true"
            aria-labelledby="clientes-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="clientes-modal-title">
              {modal === "crear" ? "Nuevo cliente" : "Editar cliente"}
            </h2>
            <p className="page-subtitle">
              {modal === "crear"
                ? "Ingresa los datos del cliente para registrarlo."
                : "Actualiza los datos del cliente. Se aplican las mismas validaciones que al crear."}
            </p>

            <form className="modal-form" onSubmit={handleSubmit} noValidate>
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
                  placeholder="Ej. Ana López"
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
                    value={form.telefono}
                    onChange={onChange}
                    placeholder="Ej. 5555-1234"
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
                  placeholder="Ej. ana@cliente.com"
                  disabled={guardando}
                />
                {fieldErrors.correo && (
                  <em className="field-error">{fieldErrors.correo}</em>
                )}
              </label>

              <div className="form-section">
                <p className="form-section__title">Dirección</p>

                <div className="form-grid-2">
                  <label className="field">
                    <span>Departamento</span>
                    <select
                      name="idDepartamento"
                      value={form.idDepartamento}
                      onChange={onChange}
                      disabled={guardando}
                    >
                      <option value="">Seleccione…</option>
                      {departamentos.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.nombre}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label
                    className={`field ${fieldErrors.idMunicipio ? "field--error" : ""}`}
                  >
                    <span>Municipio</span>
                    <select
                      name="idMunicipio"
                      value={form.idMunicipio}
                      onChange={onChange}
                      disabled={
                        guardando ||
                        !form.idDepartamento ||
                        cargandoMunicipios
                      }
                    >
                      <option value="">
                        {!form.idDepartamento
                          ? "Elija departamento"
                          : cargandoMunicipios
                            ? "Cargando…"
                            : "Seleccione…"}
                      </option>
                      {municipios.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nombre}
                        </option>
                      ))}
                    </select>
                    {fieldErrors.idMunicipio && (
                      <em className="field-error">{fieldErrors.idMunicipio}</em>
                    )}
                  </label>
                </div>

                <div className="form-grid-2">
                  <label className="field">
                    <span>Zona</span>
                    <input
                      name="zona"
                      value={form.zona}
                      onChange={onChange}
                      placeholder="Ej. 10"
                      disabled={guardando}
                    />
                  </label>
                  <label className="field">
                    <span>No. casa</span>
                    <input
                      name="numeroCasa"
                      value={form.numeroCasa}
                      onChange={onChange}
                      placeholder="Ej. 10-22"
                      disabled={guardando}
                    />
                  </label>
                </div>

                <div className="form-grid-2">
                  <label className="field">
                    <span>Calle</span>
                    <input
                      name="calle"
                      value={form.calle}
                      onChange={onChange}
                      placeholder="Ej. 5a calle"
                      disabled={guardando}
                    />
                  </label>
                  <label className="field">
                    <span>Avenida</span>
                    <input
                      name="avenida"
                      value={form.avenida}
                      onChange={onChange}
                      placeholder="Ej. 10a avenida"
                      disabled={guardando}
                    />
                  </label>
                </div>

                <label className="field">
                  <span>Colonia</span>
                  <input
                    name="colonia"
                    value={form.colonia}
                    onChange={onChange}
                    placeholder="Ej. Oakland"
                    disabled={guardando}
                  />
                </label>

                <label className="field">
                  <span>Referencia</span>
                  <input
                    name="referencia"
                    value={form.referencia}
                    onChange={onChange}
                    placeholder="Ej. Frente al parque"
                    disabled={guardando}
                  />
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
          </div>
        </div>
      )}
    </AppShell>
  );
}
