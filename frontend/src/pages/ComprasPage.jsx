import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, PackageCheck, Pencil, Plus, Search, Trash2 } from "lucide-react";
import AppShell from "../layout/AppShell";
import {
  createCompra,
  getCompra,
  listCompras,
  listProductosActivos,
  listProveedoresActivos,
  updateCompra,
  notificarAlertas,
  recibirCompra,
} from "../api/client";

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

let lineKeySeq = 0;

function nuevaLinea(prefill = {}) {
  lineKeySeq += 1;
  return {
    key: lineKeySeq,
    idProducto: prefill.idProducto ?? "",
    cantidad: prefill.cantidad ?? "",
    costoUnitario: prefill.costoUnitario ?? "",
  };
}

function lineaSubtotal(linea) {
  const cantidad = Number(linea.cantidad);
  const costo = Number(linea.costoUnitario);
  if (!Number.isFinite(cantidad) || !Number.isFinite(costo)) return 0;
  return Math.round(cantidad * costo * 100) / 100;
}

function validarFormulario(form) {
  const fields = {};
  if (!form.idProveedor) {
    fields.idProveedor = "Seleccione un proveedor";
  }
  if (!form.lineas.length) {
    fields.lineas = "Debe agregar al menos un producto";
  }
  form.lineas.forEach((linea, index) => {
    if (!linea.idProducto) {
      fields[`lineas_${index}_idProducto`] = "Seleccione un producto";
    }
    const cantidad = Number(linea.cantidad);
    if (linea.cantidad === "" || Number.isNaN(cantidad)) {
      fields[`lineas_${index}_cantidad`] = "La cantidad es obligatoria";
    } else if (cantidad <= 0) {
      fields[`lineas_${index}_cantidad`] = "La cantidad debe ser mayor a 0";
    }
    const costo = Number(linea.costoUnitario);
    if (linea.costoUnitario === "" || Number.isNaN(costo)) {
      fields[`lineas_${index}_costoUnitario`] = "El costo es obligatorio";
    } else if (costo <= 0) {
      fields[`lineas_${index}_costoUnitario`] =
        "El costo debe ser mayor a 0";
    }
  });

  const ids = form.lineas.map((l) => l.idProducto).filter(Boolean);
  if (ids.length > 1 && new Set(ids).size !== ids.length) {
    fields.lineas = "No puede repetir el mismo producto";
  }

  return fields;
}

function payloadDesdeForm(form) {
  return {
    idProveedor: Number(form.idProveedor),
    lineas: form.lineas.map((l) => ({
      idProducto: Number(l.idProducto),
      cantidad: Number(l.cantidad),
      costoUnitario: Number(l.costoUnitario),
    })),
  };
}

function estadoBadgeClass(estado) {
  if (estado === "PENDIENTE") return "badge--warning";
  if (estado === "RECIBIDA") return "badge--success";
  if (estado === "CANCELADA") return "badge--danger";
  return "badge--info";
}

export default function ComprasPage() {
  const [compras, setCompras] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [modal, setModal] = useState(null);
  const [editandoId, setEditandoId] = useState(null);
  const [form, setForm] = useState({
    idProveedor: "",
    lineas: [nuevaLinea()],
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [cargandoModal, setCargandoModal] = useState(false);
  const [recibiendo, setRecibiendo] = useState(null);

  const comprasFiltradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return compras;
    return compras.filter(
      (c) =>
        (c.numeroCompra || "").toLowerCase().includes(q) ||
        (c.proveedorNombre || "").toLowerCase().includes(q)
    );
  }, [compras, busqueda]);

  const totalForm = useMemo(
    () =>
      form.lineas.reduce((sum, linea) => sum + lineaSubtotal(linea), 0),
    [form.lineas]
  );

  const cargarLista = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await listCompras();
      setCompras(res.data || []);
    } catch (err) {
      setError(err.message || "No se pudo cargar las órdenes de compra");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargarLista();
  }, [cargarLista]);

  async function cargarCatalogos() {
    const [provRes, prodRes] = await Promise.all([
      listProveedoresActivos(),
      listProductosActivos(),
    ]);
    setProveedores(provRes.data || []);
    setProductos(prodRes.data || []);
  }

  async function abrirCrear() {
    setModal("form");
    setEditandoId(null);
    setForm({ idProveedor: "", lineas: [nuevaLinea()] });
    setFieldErrors({});
    setFormError("");
    setCargandoModal(true);
    try {
      await cargarCatalogos();
    } catch (err) {
      setFormError(err.message || "No se pudieron cargar proveedores y productos");
    } finally {
      setCargandoModal(false);
    }
  }

  async function abrirEditar(compra) {
    if (!compra.editable) return;
    setModal("form");
    setEditandoId(compra.id);
    setFieldErrors({});
    setFormError("");
    setCargandoModal(true);
    try {
      await cargarCatalogos();
      const res = await getCompra(compra.id);
      const data = res.data;
      setForm({
        idProveedor: String(data.idProveedor),
        lineas: data.lineas.map((l) =>
          nuevaLinea({
            idProducto: String(l.idProducto),
            cantidad: String(l.cantidad),
            costoUnitario: String(l.costoUnitario),
          })
        ),
      });
    } catch (err) {
      setFormError(err.message || "No se pudo cargar la compra");
    } finally {
      setCargandoModal(false);
    }
  }

  function cerrarModal(forzar = false) {
    if (guardando && !forzar) return;
    setModal(null);
    setEditandoId(null);
    setForm({ idProveedor: "", lineas: [nuevaLinea()] });
    setFieldErrors({});
    setFormError("");
  }

  function onProveedorChange(e) {
    const { value } = e.target;
    setForm((prev) => ({ ...prev, idProveedor: value }));
    setFieldErrors((prev) => {
      if (!prev.idProveedor) return prev;
      const next = { ...prev };
      delete next.idProveedor;
      return next;
    });
    setFormError("");
  }

  function onLineaChange(index, field, value) {
    setForm((prev) => {
      const lineas = prev.lineas.map((l, i) => {
        if (i !== index) return l;
        const next = { ...l, [field]: value };
        if (field === "idProducto" && value) {
          const prod = productos.find((p) => String(p.id) === value);
          if (prod && !next.costoUnitario) {
            next.costoUnitario = String(prod.precioCompra || "");
          }
        }
        return next;
      });
      return { ...prev, lineas };
    });
    setFieldErrors((prev) => {
      const key = `lineas_${index}_${field}`;
      if (!prev[key] && !prev.lineas) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setFormError("");
  }

  function agregarLinea() {
    setForm((prev) => ({
      ...prev,
      lineas: [...prev.lineas, nuevaLinea()],
    }));
  }

  function quitarLinea(index) {
    setForm((prev) => {
      if (prev.lineas.length <= 1) return prev;
      return {
        ...prev,
        lineas: prev.lineas.filter((_, i) => i !== index),
      };
    });
  }

  function abrirRecibir(compra) {
    setRecibiendo(compra);
    setFormError("");
  }

  function cerrarRecibir() {
    if (guardando) return;
    setRecibiendo(null);
    setFormError("");
  }

  async function confirmarRecibir() {
    if (!recibiendo) return;
    setGuardando(true);
    setFormError("");
    try {
      await recibirCompra(recibiendo.id);
      setGuardando(false);
      setRecibiendo(null);
      notificarAlertas();
      await cargarLista();
    } catch (err) {
      setFormError(err.message || "No se pudo recibir la compra");
      setGuardando(false);
    }
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
      if (editandoId) {
        await updateCompra(editandoId, payload);
      } else {
        await createCompra(payload);
      }
      setGuardando(false);
      cerrarModal(true);
      await cargarLista();
    } catch (err) {
      if (err.body?.fields) {
        setFieldErrors(err.body.fields);
      }
      setFormError(
        err.message ||
          "No se pudo guardar la orden de compra. Intente de nuevo."
      );
      setGuardando(false);
    }
  }

  return (
    <AppShell
      title="Compras"
      subtitle="Registra órdenes de compra con proveedor, productos, cantidades y costos."
      actions={
        <button
          type="button"
          className="btn btn-primary btn-inline"
          onClick={abrirCrear}
        >
          <Plus size={16} strokeWidth={2} />
          Nueva compra
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
            placeholder="Buscar por número o proveedor…"
            aria-label="Buscar compras"
          />
        </label>
        {!loading && (
          <span className="toolbar-meta">
            {comprasFiltradas.length} de {compras.length}
          </span>
        )}
      </div>

      <section className="card table-card">
        {loading ? (
          <p className="status-pending">
            <Loader2 size={16} className="spin" /> Cargando compras…
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Proveedor</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th>Total</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {comprasFiltradas.map((c) => (
                  <tr key={c.id}>
                    <td className="mono">{c.numeroCompra}</td>
                    <td>{c.proveedorNombre}</td>
                    <td>{formatFecha(c.fechaCompra)}</td>
                    <td>
                      <span className={`badge ${estadoBadgeClass(c.estado)}`}>
                        {c.estado}
                      </span>
                    </td>
                    <td className="mono">{formatMoney(c.total)}</td>
                    <td>
                      <div className="row-actions">
                        {c.editable && (
                          <button
                            type="button"
                            className="btn-action btn-action--edit"
                            onClick={() => abrirEditar(c)}
                            title="Editar compra pendiente"
                          >
                            <Pencil size={14} strokeWidth={1.75} />
                            Editar
                          </button>
                        )}
                        {c.puedeRecibir && (
                          <button
                            type="button"
                            className="btn-action btn-action--success"
                            onClick={() => abrirRecibir(c)}
                            title="Marcar como recibida"
                          >
                            <PackageCheck size={14} strokeWidth={1.75} />
                            Recibir
                          </button>
                        )}
                        {!c.editable && !c.puedeRecibir && (
                          <span className="cell-muted">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {comprasFiltradas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="empty-cell">
                      {compras.length === 0
                        ? "No hay órdenes de compra registradas."
                        : "No se encontraron compras con esa búsqueda."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {recibiendo && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={cerrarRecibir}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="compras-recibir-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-confirm-icon modal-confirm-icon--success" aria-hidden="true">
              <PackageCheck size={22} strokeWidth={1.75} />
            </div>
            <h2 id="compras-recibir-title">Recibir compra</h2>
            <p className="page-subtitle">
              ¿Confirmar recepción de la orden{" "}
              <strong className="mono">{recibiendo.numeroCompra}</strong> del
              proveedor <strong>{recibiendo.proveedorNombre}</strong>? Se
              registrará una <strong>ENTRADA</strong> por cada producto y la
              existencia subirá con las cantidades compradas.
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
                onClick={cerrarRecibir}
                disabled={guardando}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-success btn-inline"
                onClick={confirmarRecibir}
                disabled={guardando}
              >
                {guardando ? (
                  <>
                    <Loader2 size={16} className="spin" />
                    Recibiendo…
                  </>
                ) : (
                  "Confirmar recepción"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {modal === "form" && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => cerrarModal()}
        >
          <div
            className="modal modal--compra modal--fit"
            role="dialog"
            aria-modal="true"
            aria-labelledby="compras-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="compras-modal-title">
              {editandoId ? "Editar orden de compra" : "Nueva orden de compra"}
            </h2>
            <p className="page-subtitle">
              {editandoId
                ? "Solo las compras en estado PENDIENTE se pueden modificar. El inventario se actualiza al recibir la mercadería."
                : "Seleccione un proveedor activo y agregue al menos un producto con cantidad y costo mayores a cero."}
            </p>

            {cargandoModal ? (
              <p className="status-pending">
                <Loader2 size={16} className="spin" /> Cargando…
              </p>
            ) : (
              <form
                className="modal-form"
                onSubmit={handleSubmit}
                noValidate
              >
                <label
                  className={`field ${fieldErrors.idProveedor ? "field--error" : ""}`}
                >
                  <span>
                    Proveedor
                    <span className="field-required" aria-hidden="true">*</span>
                  </span>
                  <select
                    name="idProveedor"
                    value={form.idProveedor}
                    onChange={onProveedorChange}
                    disabled={guardando}
                    required
                    aria-required="true"
                  >
                    <option value="">Seleccione…</option>
                    {proveedores.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre} — {p.nit}
                      </option>
                    ))}
                  </select>
                  {fieldErrors.idProveedor && (
                    <em className="field-error">{fieldErrors.idProveedor}</em>
                  )}
                </label>

                <div className="form-section">
                  <p className="form-section__title">Detalle de productos</p>

                  {fieldErrors.lineas && (
                    <p className="form-error" role="alert">
                      {fieldErrors.lineas}
                    </p>
                  )}

                  <div className="compra-lineas">
                    {form.lineas.map((linea, index) => (
                      <div className="compra-linea" key={linea.key}>
                        <div className="compra-linea__header">
                          <label
                            className={`field ${fieldErrors[`lineas_${index}_idProducto`] ? "field--error" : ""}`}
                          >
                            <span>Producto</span>
                            <select
                              value={linea.idProducto}
                              onChange={(e) =>
                                onLineaChange(
                                  index,
                                  "idProducto",
                                  e.target.value
                                )
                              }
                              disabled={guardando}
                              aria-invalid={Boolean(
                                fieldErrors[`lineas_${index}_idProducto`]
                              )}
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
                            disabled={guardando || form.lineas.length <= 1}
                            title="Quitar producto"
                            aria-label="Quitar producto"
                          >
                            <Trash2 size={16} strokeWidth={1.75} />
                          </button>
                        </div>

                        <div className="form-grid-2">
                          <label
                            className={`field ${fieldErrors[`lineas_${index}_cantidad`] ? "field--error" : ""}`}
                          >
                            <span>Cantidad</span>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={linea.cantidad}
                              onChange={(e) =>
                                onLineaChange(index, "cantidad", e.target.value)
                              }
                              placeholder="Ej. 10"
                              disabled={guardando}
                              className="mono"
                              inputMode="decimal"
                            />
                            {fieldErrors[`lineas_${index}_cantidad`] && (
                              <em className="field-error">
                                {fieldErrors[`lineas_${index}_cantidad`]}
                              </em>
                            )}
                          </label>

                          <label
                            className={`field ${fieldErrors[`lineas_${index}_costoUnitario`] ? "field--error" : ""}`}
                          >
                            <span>Costo unitario</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={linea.costoUnitario}
                              onChange={(e) =>
                                onLineaChange(
                                  index,
                                  "costoUnitario",
                                  e.target.value
                                )
                              }
                              placeholder="Ej. 25.50"
                              disabled={guardando}
                              className="mono"
                              inputMode="decimal"
                            />
                            {fieldErrors[`lineas_${index}_costoUnitario`] && (
                              <em className="field-error">
                                {fieldErrors[`lineas_${index}_costoUnitario`]}
                              </em>
                            )}
                          </label>
                        </div>

                        <div className="compra-linea__footer">
                          <span className="compra-linea__footer-label">
                            Subtotal línea
                          </span>
                          <span className="compra-linea__footer-value mono">
                            {formatMoney(lineaSubtotal(linea))}
                          </span>
                        </div>
                      </div>
                    ))}
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

                <div className="compra-total-row">
                  <span>Total de la orden</span>
                  <strong className="mono">{formatMoney(totalForm)}</strong>
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
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
