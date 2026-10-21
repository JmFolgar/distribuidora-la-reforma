import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import AppShell from "../layout/AppShell";
import { useAuth } from "../auth/AuthContext";
import {
  aprobarPedido,
  createPedido,
  getPedido,
  listClientes,
  listPedidos,
  listProductos,
  rechazarPedido,
  updatePedido,
} from "../api/client";
import { enteroValido } from "../utils/validacion";

function formatMoney(value) {
  return Number(value || 0).toLocaleString("es-GT", {
    style: "currency",
    currency: "GTQ",
    minimumFractionDigits: 2,
  });
}

function formatFecha(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-GT", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function textoDisponibles(existencia) {
  const n = Number(existencia);
  if (n === 1) return "Hay 1 unidad disponible";
  const cantidad = Number.isInteger(n) ? String(n) : String(n);
  return `Hay ${cantidad} unidades disponibles`;
}

function roundMoney(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

let lineKeySeq = 0;

function nuevaLinea(prefill = {}) {
  lineKeySeq += 1;
  return {
    key: lineKeySeq,
    idProducto: prefill.idProducto ?? "",
    cantidad: prefill.cantidad ?? "",
  };
}

function productoDe(productos, idProducto) {
  return productos.find((p) => String(p.id) === String(idProducto));
}

function lineaSubtotal(linea, productos) {
  const producto = productoDe(productos, linea.idProducto);
  const cantidad = Number(linea.cantidad);
  const precio = Number(producto?.precioVenta);
  if (!producto || !Number.isFinite(cantidad) || !Number.isFinite(precio)) return 0;
  return roundMoney(cantidad * precio);
}

function descuentoValido(valor) {
  if (valor === "" || valor == null) return true;
  if (!/^\d+(\.\d{1,2})?$/.test(String(valor))) return false;
  const n = Number(valor);
  return n >= 0 && n <= 100;
}

function validarFormulario(form, productos) {
  const fields = {};
  if (!form.idCliente) {
    fields.idCliente = "Seleccione un cliente";
  }
  if (!form.lineas.length) {
    fields.lineas = "Debe agregar al menos un producto";
  }
  if (!descuentoValido(form.porcentajeDescuento)) {
    fields.porcentajeDescuento =
      "El descuento debe estar entre 0 y 100, con máximo 2 decimales";
  }

  form.lineas.forEach((linea, index) => {
    if (!linea.idProducto) {
      fields[`lineas_${index}_idProducto`] = "Seleccione un producto";
    }
    if (linea.cantidad === "") {
      fields[`lineas_${index}_cantidad`] = "La cantidad es obligatoria";
    } else if (!enteroValido(linea.cantidad) || Number(linea.cantidad) <= 0) {
      fields[`lineas_${index}_cantidad`] =
        "La cantidad debe ser un número entero mayor a 0";
    } else {
      const producto = productoDe(productos, linea.idProducto);
      if (producto && Number(linea.cantidad) > Number(producto.existencia)) {
        fields[`lineas_${index}_cantidad`] = textoDisponibles(producto.existencia);
      }
    }
  });

  const ids = form.lineas.map((l) => l.idProducto).filter(Boolean);
  if (ids.length > 1 && new Set(ids).size !== ids.length) {
    fields.lineas = "No puede repetir el mismo producto";
  }

  return fields;
}

function payloadDesdeForm(form, enviar) {
  return {
    idCliente: Number(form.idCliente),
    porcentajeDescuento:
      form.porcentajeDescuento === "" ? 0 : Number(form.porcentajeDescuento),
    enviar,
    lineas: form.lineas.map((l) => ({
      idProducto: Number(l.idProducto),
      cantidad: Number(l.cantidad),
    })),
  };
}

function estadoBadgeClass(estado) {
  if (estado === "PENDIENTE_APROBACION") return "badge--warning";
  if (estado === "APROBADO" || estado === "COMPLETADO") return "badge--success";
  if (estado === "CANCELADO") return "badge--danger";
  if (estado === "CREADO") return "badge--info";
  return "badge--info";
}

export default function PedidosPage() {
  const { usuario } = useAuth();
  const rolesUsuario = usuario?.roles?.length
    ? usuario.roles
    : usuario?.rol
      ? [usuario.rol]
      : [];
  const puedeDecidir = rolesUsuario.some(
    (rol) => rol === "SUPERVISOR" || rol === "ADMINISTRADOR"
  );
  const [pedidos, setPedidos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [productos, setProductos] = useState([]);
  const [limiteDescuento, setLimiteDescuento] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [modal, setModal] = useState(false);
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState({
    idCliente: "",
    porcentajeDescuento: "",
    lineas: [nuevaLinea()],
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [guardando, setGuardando] = useState(null);
  const [cargandoModal, setCargandoModal] = useState(false);
  const [revision, setRevision] = useState(null);
  const [cargandoRevision, setCargandoRevision] = useState(false);
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [motivoError, setMotivoError] = useState("");
  const [revisionError, setRevisionError] = useState("");
  const [resolviendo, setResolviendo] = useState(false);

  const pedidosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return pedidos;
    return pedidos.filter(
      (p) =>
        (p.numeroPedido || "").toLowerCase().includes(q) ||
        (p.clienteNombre || "").toLowerCase().includes(q) ||
        (p.estadoNombre || "").toLowerCase().includes(q)
    );
  }, [pedidos, busqueda]);

  const subtotalForm = useMemo(
    () => form.lineas.reduce((sum, linea) => sum + lineaSubtotal(linea, productos), 0),
    [form.lineas, productos]
  );
  const porcentajeNumero = descuentoValido(form.porcentajeDescuento)
    ? Number(form.porcentajeDescuento || 0)
    : 0;
  const descuentoForm = roundMoney(subtotalForm * (porcentajeNumero / 100));
  const totalForm = roundMoney(subtotalForm - descuentoForm);

  const cargarLista = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await listPedidos();
      setPedidos(res.data || []);
      if (res.porcentajeMaximoSinAprobacion != null) {
        setLimiteDescuento(Number(res.porcentajeMaximoSinAprobacion));
      }
    } catch (err) {
      setError(err.message || "No se pudieron cargar los pedidos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargarLista();
  }, [cargarLista]);

  async function cargarCatalogos() {
    const [cliRes, prodRes] = await Promise.all([
      listClientes(),
      listProductos(),
    ]);
    setClientes((cliRes.data || []).filter((c) => c.activo));
    setProductos((prodRes.data || []).filter((p) => p.activo !== false && p.estado !== "I"));
  }

  function cerrarModal(forzar = false) {
    if (guardando && !forzar) return;
    setModal(false);
    setEditandoId(null);
    setFieldErrors({});
    setFormError("");
  }

  async function abrirCrear() {
    setModal(true);
    setEditandoId(null);
    setForm({
      idCliente: "",
      porcentajeDescuento: "",
      lineas: [nuevaLinea()],
    });
    setFieldErrors({});
    setFormError("");
    setCargandoModal(true);
    try {
      await cargarCatalogos();
    } catch (err) {
      setFormError(err.message || "No se pudieron cargar clientes y productos");
    } finally {
      setCargandoModal(false);
    }
  }

  async function abrirEditar(pedido) {
    if (!pedido.editable) return;
    setModal(true);
    setEditandoId(pedido.id);
    setFieldErrors({});
    setFormError("");
    setCargandoModal(true);
    try {
      await cargarCatalogos();
      const res = await getPedido(pedido.id);
      const data = res.data;
      setForm({
        idCliente: String(data.idCliente),
        porcentajeDescuento:
          data.porcentajeDescuento > 0 ? String(data.porcentajeDescuento) : "",
        lineas: data.lineas.length
          ? data.lineas.map((l) =>
              nuevaLinea({
                idProducto: String(l.idProducto),
                cantidad: String(l.cantidad),
              })
            )
          : [nuevaLinea()],
      });
    } catch (err) {
      setFormError(err.message || "No se pudo abrir el pedido");
    } finally {
      setCargandoModal(false);
    }
  }

  function onLineaChange(index, campo, valor) {
    setForm((prev) => ({
      ...prev,
      lineas: prev.lineas.map((linea, i) =>
        i === index ? { ...linea, [campo]: valor } : linea
      ),
    }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[`lineas_${index}_${campo}`];
      delete next.lineas;
      return next;
    });
  }

  function agregarLinea() {
    setForm((prev) => ({ ...prev, lineas: [...prev.lineas, nuevaLinea()] }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.lineas;
      return next;
    });
  }

  function quitarLinea(index) {
    setForm((prev) => ({
      ...prev,
      lineas: prev.lineas.filter((_, i) => i !== index),
    }));
    setFieldErrors({});
  }

  async function guardar(enviar) {
    setFormError("");
    const locals = validarFormulario(form, productos);
    if (Object.keys(locals).length > 0) {
      setFieldErrors(locals);
      return;
    }

    setGuardando(enviar ? "enviar" : "guardar");
    try {
      const payload = payloadDesdeForm(form, enviar);
      if (editandoId) {
        await updatePedido(editandoId, payload);
      } else {
        await createPedido(payload);
      }
      setGuardando(null);
      cerrarModal(true);
      await cargarLista();
    } catch (err) {
      if (err.body?.fields) setFieldErrors(err.body.fields);
      setFormError(err.message || "No se pudo guardar el pedido");
      setGuardando(null);
    }
  }

  function cerrarRevision(forzar = false) {
    if (resolviendo && !forzar) return;
    setRevision(null);
    setRechazando(false);
    setMotivo("");
    setMotivoError("");
    setRevisionError("");
  }

  async function abrirRevision(pedido) {
    setRevision(pedido);
    setRechazando(false);
    setMotivo("");
    setMotivoError("");
    setRevisionError("");
    setCargandoRevision(true);
    try {
      const res = await getPedido(pedido.id);
      setRevision(res.data);
    } catch (err) {
      setRevisionError(err.message || "No se pudo abrir el pedido");
    } finally {
      setCargandoRevision(false);
    }
  }

  async function aprobar() {
    if (!revision) return;
    setResolviendo(true);
    setRevisionError("");
    try {
      await aprobarPedido(revision.id);
      setResolviendo(false);
      cerrarRevision(true);
      await cargarLista();
    } catch (err) {
      setRevisionError(err.message || "No se pudo aprobar el pedido");
      setResolviendo(false);
    }
  }

  async function rechazar() {
    const texto = motivo.trim();
    if (!texto) {
      setMotivoError("Escriba por qué rechaza el pedido");
      return;
    }
    setResolviendo(true);
    setRevisionError("");
    setMotivoError("");
    try {
      await rechazarPedido(revision.id, texto);
      setResolviendo(false);
      cerrarRevision(true);
      await cargarLista();
    } catch (err) {
      if (err.body?.fields?.motivo) setMotivoError(err.body.fields.motivo);
      setRevisionError(err.message || "No se pudo rechazar el pedido");
      setResolviendo(false);
    }
  }

  return (
    <AppShell
      title="Pedidos"
      subtitle="Anota lo que el cliente quiere comprar. Guárdalo si todavía lo vas a revisar, o envíalo cuando ya esté listo."
      actions={
        <button type="button" className="btn btn-primary btn-inline" onClick={abrirCrear}>
          <Plus size={16} strokeWidth={2} />
          Nuevo pedido
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
            placeholder="Buscar por número, cliente o estado…"
            aria-label="Buscar pedidos"
          />
        </label>
        {!loading && (
          <span className="toolbar-meta">
            {pedidosFiltrados.length} de {pedidos.length}
          </span>
        )}
      </div>

      <section className="card table-card">
        {loading ? (
          <p className="status-pending">
            <Loader2 size={16} className="spin" /> Cargando pedidos…
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Cliente</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th>Descuento</th>
                  <th>Total</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pedidosFiltrados.map((p) => (
                  <tr key={p.id}>
                    <td className="mono">{p.numeroPedido}</td>
                    <td>{p.clienteNombre}</td>
                    <td>{formatFecha(p.fechaPedido)}</td>
                    <td>
                      <span className={`badge ${estadoBadgeClass(p.estado)}`}>
                        {p.estadoNombre}
                      </span>
                    </td>
                    <td className="mono">{Number(p.porcentajeDescuento)}%</td>
                    <td className="mono">{formatMoney(p.total)}</td>
                    <td>
                      <div className="row-actions">
                        {p.editable ? (
                          <button
                            type="button"
                            className="btn-action btn-action--edit"
                            onClick={() => abrirEditar(p)}
                            title="Editar pedido creado"
                          >
                            <Pencil size={14} strokeWidth={1.75} />
                            Editar
                          </button>
                        ) : (
                          <button
                            type="button"
                            className={`btn-action ${p.estado === "PENDIENTE_APROBACION" ? "btn-action--warning" : "btn-action--edit"}`}
                            onClick={() => abrirRevision(p)}
                          >
                            <Eye size={14} strokeWidth={1.75} />
                            {p.estado === "PENDIENTE_APROBACION" ? "Revisar" : "Ver"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {pedidosFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={7} className="empty-cell">
                      {pedidos.length === 0
                        ? "No hay pedidos registrados."
                        : "No se encontraron pedidos con esa búsqueda."}
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
            className="modal modal--compra modal--fit"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pedidos-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="pedidos-modal-title">
              {editandoId ? "Editar pedido" : "Nuevo pedido"}
            </h2>
            <p className="page-subtitle">
              Elige el cliente y los productos. Si lo guardas, puedes corregirlo
              después. Al enviarlo ya no se puede cambiar.
            </p>

            {cargandoModal ? (
              <p className="status-pending">
                <Loader2 size={16} className="spin" /> Cargando…
              </p>
            ) : (
              <form
                className="modal-form"
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  guardar(false);
                }}
              >
                <label className={`field ${fieldErrors.idCliente ? "field--error" : ""}`}>
                  <span>
                    Cliente
                    <span className="field-required" aria-hidden="true">*</span>
                  </span>
                  <select
                    value={form.idCliente}
                    onChange={(e) => {
                      setForm((prev) => ({ ...prev, idCliente: e.target.value }));
                      setFieldErrors((prev) => {
                        const next = { ...prev };
                        delete next.idCliente;
                        return next;
                      });
                    }}
                    disabled={guardando}
                    required
                    aria-required="true"
                  >
                    <option value="">Seleccione…</option>
                    {clientes.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre} — {c.nit}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.idCliente && (
                    <em className="field-error">{fieldErrors.idCliente}</em>
                  )}
                </label>

                <label
                  className={`field ${fieldErrors.porcentajeDescuento ? "field--error" : ""}`}
                >
                  <span>Descuento (%)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="mono"
                    value={form.porcentajeDescuento}
                    placeholder="Ej. 5"
                    disabled={guardando}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value !== "" && !/^\d*\.?\d{0,2}$/.test(value)) return;
                      setForm((prev) => ({ ...prev, porcentajeDescuento: value }));
                      setFieldErrors((prev) => {
                        const next = { ...prev };
                        delete next.porcentajeDescuento;
                        return next;
                      });
                    }}
                  />
                  {fieldErrors.porcentajeDescuento ? (
                    <em className="field-error">{fieldErrors.porcentajeDescuento}</em>
                  ) : (
                    <span className="field-help">
                      Con {limiteDescuento} % o menos, el pedido sale aprobado. Si
                      pides más, queda esperando que alguien lo autorice.
                    </span>
                  )}
                </label>

                <div className="form-section">
                  <p className="form-section__title">Productos</p>
                  {fieldErrors.lineas && (
                    <p className="form-error" role="alert">
                      {fieldErrors.lineas}
                    </p>
                  )}

                  <div className="compra-lineas">
                    {form.lineas.map((linea, index) => {
                      const producto = productoDe(productos, linea.idProducto);
                      const errorCantidad = fieldErrors[`lineas_${index}_cantidad`];
                      const supera =
                        producto &&
                        linea.cantidad !== "" &&
                        enteroValido(linea.cantidad) &&
                        Number(linea.cantidad) > Number(producto.existencia);
                      return (
                        <div className="compra-linea" key={linea.key}>
                          <div className="compra-linea__header">
                            <label
                              className={`field ${fieldErrors[`lineas_${index}_idProducto`] ? "field--error" : ""}`}
                            >
                              <span>
                                Producto
                                <span className="field-required" aria-hidden="true">*</span>
                              </span>
                              <select
                                value={linea.idProducto}
                                disabled={guardando}
                                onChange={(e) =>
                                  onLineaChange(index, "idProducto", e.target.value)
                                }
                              >
                                <option value="">Seleccione…</option>
                                {productos.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.codigo} — {p.nombre}
                                  </option>
                                ))}
                              </select>
                              {fieldErrors[`lineas_${index}_idProducto`] && (
                                <em className="field-error">
                                  {fieldErrors[`lineas_${index}_idProducto`]}
                                </em>
                              )}
                            </label>
                            <button
                              type="button"
                              className="icon-btn icon-btn--danger"
                              onClick={() => quitarLinea(index)}
                              disabled={guardando}
                              title="Quitar producto"
                              aria-label="Quitar producto"
                            >
                              <Trash2 size={16} strokeWidth={1.75} />
                            </button>
                          </div>

                          <div className="form-grid-2">
                            <label className={`field ${errorCantidad || supera ? "field--error" : ""}`}>
                              <span>
                                Cantidad
                                <span className="field-required" aria-hidden="true">*</span>
                              </span>
                              <input
                                type="text"
                                inputMode="numeric"
                                className="mono"
                                value={linea.cantidad}
                                placeholder="Ej. 2"
                                disabled={guardando}
                                onChange={(e) => {
                                  const value = e.target.value;
                                  if (value !== "" && !/^\d+$/.test(value)) return;
                                  onLineaChange(index, "cantidad", value);
                                }}
                              />
                              {errorCantidad || supera ? (
                                <em className="field-error">
                                  {errorCantidad || textoDisponibles(producto.existencia)}
                                </em>
                              ) : (
                                producto && (
                                  <span className="field-help">
                                    Disponibles: {Number(producto.existencia)} ·{" "}
                                    {formatMoney(producto.precioVenta)}
                                  </span>
                                )
                              )}
                            </label>
                            <div className="compra-linea__footer">
                              <span className="compra-linea__footer-label">Subtotal</span>
                              <span className="compra-linea__footer-value mono">
                                {formatMoney(lineaSubtotal(linea, productos))}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    className="btn-ghost btn-inline compra-lineas__add"
                    onClick={agregarLinea}
                    disabled={guardando}
                  >
                    <Plus size={16} strokeWidth={2} />
                    Agregar producto
                  </button>
                </div>

                <div className="pedido-totales">
                  <div className="compra-total-row">
                    <span>Subtotal</span>
                    <strong className="mono">{formatMoney(subtotalForm)}</strong>
                  </div>
                  <div className="compra-total-row">
                    <span>Descuento{porcentajeNumero > 0 ? ` (${porcentajeNumero}%)` : ""}</span>
                    <strong className="mono">{formatMoney(descuentoForm)}</strong>
                  </div>
                  <div className="compra-total-row compra-total-row--final">
                    <span>Total</span>
                    <strong className="mono">{formatMoney(totalForm)}</strong>
                  </div>
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
                    onClick={cerrarModal}
                    disabled={guardando}
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="btn-save"
                    disabled={guardando}
                  >
                    {guardando === "guardar" ? (
                      <>
                        <Loader2 size={16} className="spin" />
                        Guardando…
                      </>
                    ) : (
                      "Guardar"
                    )}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-inline"
                    disabled={guardando}
                    onClick={() => guardar(true)}
                  >
                    {guardando === "enviar" ? (
                      <>
                        <Loader2 size={16} className="spin" />
                        Enviando…
                      </>
                    ) : (
                      "Enviar"
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {revision && (
        <div className="modal-backdrop" role="presentation" onClick={cerrarRevision}>
          <div
            className="modal modal--compra modal--fit"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pedido-revision-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="pedido-revision-title">
              {revision.estado === "PENDIENTE_APROBACION" ? "Revisar pedido" : "Pedido"}
            </h2>
            <div className="pedido-revision__intro">
              <p className="pedido-revision__numero mono">{revision.numeroPedido}</p>
              {revision.estado === "PENDIENTE_APROBACION" && (
                <p className="page-subtitle">
                  Revisa el cliente, los productos y el descuento antes de decidir.
                </p>
              )}
            </div>

            {cargandoRevision ? (
              <p className="status-pending">
                <Loader2 size={16} className="spin" /> Cargando…
              </p>
            ) : (
              <>
                <dl className="pedido-ficha">
                  <div>
                    <dt>Cliente</dt>
                    <dd>{revision.clienteNombre}</dd>
                  </div>
                  <div>
                    <dt>Creado por</dt>
                    <dd>{revision.creadoPor || "—"}</dd>
                  </div>
                  <div>
                    <dt>Descuento</dt>
                    <dd className="mono">{Number(revision.porcentajeDescuento)}%</dd>
                  </div>
                  <div>
                    <dt>Total</dt>
                    <dd className="mono">{formatMoney(revision.total)}</dd>
                  </div>
                  {revision.resueltoPor && (
                    <div>
                      <dt>{revision.estado === "CANCELADO" ? "Rechazado por" : "Aprobado por"}</dt>
                      <dd>{revision.resueltoPor}</dd>
                    </div>
                  )}
                  {revision.motivo && (
                    <div className="pedido-ficha__ancho">
                      <dt>Motivo</dt>
                      <dd>{revision.motivo}</dd>
                    </div>
                  )}
                </dl>

                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Cantidad</th>
                        <th>Precio</th>
                        <th>Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(revision.lineas || []).map((linea) => (
                        <tr key={linea.id}>
                          <td>
                            {linea.codigo} — {linea.nombre}
                          </td>
                          <td className="mono">{linea.cantidad}</td>
                          <td className="mono">{formatMoney(linea.precioUnitario)}</td>
                          <td className="mono">{formatMoney(linea.subtotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {revision.estado === "PENDIENTE_APROBACION" && !puedeDecidir && (
                  <p className="field-help">
                    Este pedido espera autorización. Solo un supervisor puede aprobarlo o rechazarlo.
                  </p>
                )}

                {puedeDecidir && revision.estado === "PENDIENTE_APROBACION" && rechazando && (
                  <label className={`field ${motivoError ? "field--error" : ""}`}>
                    <span>
                      Motivo
                      <span className="field-required" aria-hidden="true">*</span>
                    </span>
                    <textarea
                      value={motivo}
                      rows={3}
                      maxLength={500}
                      disabled={resolviendo}
                      placeholder="Por qué no se acepta este descuento"
                      onChange={(e) => {
                        setMotivo(e.target.value);
                        setMotivoError("");
                      }}
                    />
                    {motivoError ? (
                      <em className="field-error">{motivoError}</em>
                    ) : (
                      <span className="field-help">
                        El pedido quedará cancelado con este motivo.
                      </span>
                    )}
                  </label>
                )}

                {revisionError && (
                  <p className="form-error" role="alert">
                    {revisionError}
                  </p>
                )}

                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={cerrarRevision}
                    disabled={resolviendo}
                  >
                    {puedeDecidir && revision.estado === "PENDIENTE_APROBACION" ? "Cancelar" : "Cerrar"}
                  </button>
                  {puedeDecidir && revision.estado === "PENDIENTE_APROBACION" && !rechazando && (
                    <>
                      <button
                        type="button"
                        className="btn btn-danger btn-inline"
                        disabled={resolviendo}
                        onClick={() => {
                          setRechazando(true);
                          setRevisionError("");
                        }}
                      >
                        Rechazar
                      </button>
                      <button
                        type="button"
                        className="btn btn-success btn-inline"
                        disabled={resolviendo}
                        onClick={aprobar}
                      >
                        {resolviendo ? (
                          <>
                            <Loader2 size={16} className="spin" />
                            Aprobando…
                          </>
                        ) : (
                          "Aprobar"
                        )}
                      </button>
                    </>
                  )}
                  {puedeDecidir && revision.estado === "PENDIENTE_APROBACION" && rechazando && (
                    <button
                      type="button"
                      className="btn btn-danger btn-inline"
                      disabled={resolviendo}
                      onClick={rechazar}
                    >
                      {resolviendo ? (
                        <>
                          <Loader2 size={16} className="spin" />
                          Rechazando…
                        </>
                      ) : (
                        "Confirmar rechazo"
                      )}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
