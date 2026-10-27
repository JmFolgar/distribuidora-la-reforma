import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, Loader2, Search } from "lucide-react";
import AppShell from "../layout/AppShell";
import { useAuth } from "../auth/AuthContext";
import { getVenta, listVentas, registrarDevolucion } from "../api/client";

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

function cantidadEscrita(valor) {
  if (valor == null || String(valor).trim() === "") return 0;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < 0) return null;
  return n;
}

function textoCantidad(valor) {
  const n = Number(valor || 0);
  return Number.isInteger(n) ? String(n) : String(n);
}

function pendienteDe(linea) {
  if (linea?.pendiente != null) return Number(linea.pendiente);
  return Number(linea?.cantidad || 0) - Number(linea?.devuelto || 0);
}

function puedeRegistrarDevolucion(venta) {
  return (venta?.lineas || []).some((linea) => pendienteDe(linea) > 0);
}

function nombreEstado(estado) {
  if (estado === "FINALIZADA") return "Finalizada";
  if (estado === "CANCELADA") return "Cancelada";
  if (estado === "BORRADOR") return "Borrador";
  return estado || "—";
}

export default function VentasPage() {
  const navigate = useNavigate();
  const { usuario } = useAuth();
  const rolesUsuario =
    Array.isArray(usuario?.roles) && usuario.roles.length
      ? usuario.roles
      : usuario?.rol
        ? [usuario.rol]
        : [];
  const puedeDevolver = rolesUsuario.some(
    (rol) => rol === "ADMINISTRADOR" || rol === "SUPERVISOR"
  );
  const [ventas, setVentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [detalle, setDetalle] = useState(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [detalleError, setDetalleError] = useState("");
  const [devolucion, setDevolucion] = useState(null);
  const [cantidades, setCantidades] = useState({});
  const [motivo, setMotivo] = useState("");
  const [devolucionError, setDevolucionError] = useState("");
  const [devolucionFields, setDevolucionFields] = useState({});
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setError("");
    try {
      const res = await listVentas();
      setVentas(res.data || []);
    } catch (err) {
      setError(err.message || "No se pudieron cargar las ventas");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return ventas;
    return ventas.filter(
      (v) =>
        (v.numeroVenta || "").toLowerCase().includes(q) ||
        (v.numeroPedido || "").toLowerCase().includes(q) ||
        (v.clienteNombre || "").toLowerCase().includes(q)
    );
  }, [ventas, busqueda]);

  function abrirDevolucion(venta) {
    setAviso("");
    setDevolucion(venta);
    setCantidades({});
    setMotivo("");
    setDevolucionFields({});
    setDevolucionError(
      Number(venta.saldo) > 0
        ? "Termine el pago de la venta antes de registrar la devolución."
        : puedeRegistrarDevolucion(venta)
          ? ""
          : "Ya se devolvió todo lo vendido en esta venta."
    );
  }

  async function enviarDevolucion(event) {
    event.preventDefault();
    if (!devolucion || guardando) return;
    if (Number(devolucion.saldo) > 0) {
      setDevolucionError("Termine el pago de la venta antes de registrar la devolución.");
      return;
    }
    if (!puedeRegistrarDevolucion(devolucion)) {
      setDevolucionError("Ya se devolvió todo lo vendido en esta venta.");
      return;
    }

    const fields = {};
    const lineas = [];
    for (const linea of devolucion.lineas || []) {
      const pendiente = pendienteDe(linea);
      if (pendiente <= 0) continue;
      const cantidad = cantidadEscrita(cantidades[linea.id]);
      if (cantidad == null) {
        fields[`linea_${linea.id}`] = "La cantidad debe ser un número entero mayor a 0";
        continue;
      }
      if (cantidad > pendiente) {
        fields[`linea_${linea.id}`] =
          `No puede devolver más de lo vendido. De ${linea.nombre} puede devolver ${textoCantidad(pendiente)}.`;
        continue;
      }
      if (cantidad > 0) lineas.push({ idDetalleVenta: linea.id, cantidad });
    }
    if (!motivo.trim()) fields.motivo = "Escriba por qué se devuelven los productos";
    if (!lineas.length && !Object.keys(fields).some((key) => key.startsWith("linea_"))) {
      setDevolucionFields(fields);
      setDevolucionError("Indique cuántas unidades devuelve.");
      return;
    }
    if (Object.keys(fields).length) {
      setDevolucionFields(fields);
      setDevolucionError(fields.motivo || "No puede devolver más de lo vendido");
      return;
    }

    setGuardando(true);
    setDevolucionError("");
    setDevolucionFields({});
    try {
      const res = await registrarDevolucion(devolucion.id, {
        motivo: motivo.trim(),
        lineas,
      });
      setDevolucion(null);
      setAviso(res.message || "Devolución registrada. La venta no cambió.");
      cargar();
    } catch (err) {
      setDevolucionError(err.message || "No se pudo registrar la devolución");
      setDevolucionFields(err.body?.fields || {});
    } finally {
      setGuardando(false);
    }
  }

  async function abrir(venta) {
    setDetalle(venta);
    setDetalleError("");
    setCargandoDetalle(true);
    try {
      const res = await getVenta(venta.id);
      setDetalle(res.data);
    } catch (err) {
      setDetalleError(err.message || "No se pudo abrir la venta");
    } finally {
      setCargandoDetalle(false);
    }
  }

  return (
    <AppShell
      title="Ventas"
      subtitle="Cada venta entrega los productos del pedido y baja la existencia. Ya registrada, no se modifica."
    >
      {error && (
        <p className="form-error" role="alert" style={{ marginBottom: "1rem" }}>
          {error}
        </p>
      )}
      {aviso && (
        <p
          role="status"
          style={{
            margin: "0 0 1rem",
            padding: "0.75rem 1rem",
            borderRadius: 10,
            background: "var(--color-success-soft)",
            color: "#047857",
            fontSize: 14,
          }}
        >
          {aviso}
        </p>
      )}

      <div className="toolbar">
        <label className="toolbar-search">
          <Search size={16} strokeWidth={1.75} aria-hidden />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por venta, pedido o cliente…"
            aria-label="Buscar ventas"
          />
        </label>
        {!loading && (
          <span className="toolbar-meta">
            {filtradas.length} de {ventas.length}
          </span>
        )}
      </div>

      <section className="card table-card">
        {loading ? (
          <p className="status-pending">
            <Loader2 size={16} className="spin" /> Cargando ventas…
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Pedido</th>
                  <th>Cliente</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th>Total</th>
                  <th>Saldo</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map((v) => (
                  <tr key={v.id}>
                    <td className="mono">{v.numeroVenta}</td>
                    <td className="mono">{v.numeroPedido}</td>
                    <td>{v.clienteNombre}</td>
                    <td>{formatFecha(v.fechaVenta)}</td>
                    <td>
                      <span className="badge badge--success">{nombreEstado(v.estado)}</span>
                    </td>
                    <td className="mono">{formatMoney(v.total)}</td>
                    <td className="mono">{formatMoney(v.saldo)}</td>
                    <td>
                      <div className="row-actions">
                        {Number(v.saldo) > 0 && (
                          <button
                            type="button"
                            className="btn-action btn-action--success"
                            onClick={() => navigate(`/pagos?venta=${v.id}`)}
                          >
                            Pagar
                          </button>
                        )}
                        {puedeDevolver && puedeRegistrarDevolucion(v) && (
                          <button
                            type="button"
                            className="btn-action btn-action--neutral"
                            onClick={() => abrirDevolucion(v)}
                          >
                            Devolver
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn-action btn-action--edit"
                          onClick={() => abrir(v)}
                        >
                          <Eye size={14} strokeWidth={1.75} />
                          Ver
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtradas.length === 0 && (
                  <tr>
                    <td colSpan={8} className="empty-cell">
                      {ventas.length === 0
                        ? "Todavía no hay ventas. Se registran desde un pedido aprobado."
                        : "No se encontraron ventas con esa búsqueda."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {detalle && (
        <div className="modal-backdrop" role="presentation" onClick={() => setDetalle(null)}>
          <div
            className="modal modal--compra modal--fit"
            role="dialog"
            aria-modal="true"
            aria-labelledby="venta-detalle-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="venta-detalle-title">Venta</h2>
            <div className="pedido-revision__intro">
              <p className="pedido-revision__numero mono">{detalle.numeroVenta}</p>
              <p className="page-subtitle">
                Esta venta ya quedó registrada y no se puede modificar.
              </p>
            </div>

            {cargandoDetalle ? (
              <p className="status-pending">
                <Loader2 size={16} className="spin" /> Cargando…
              </p>
            ) : (
              <>
                <dl className="pedido-ficha">
                  <div>
                    <dt>Pedido</dt>
                    <dd className="mono">{detalle.numeroPedido}</dd>
                  </div>
                  <div>
                    <dt>Cliente</dt>
                    <dd>{detalle.clienteNombre}</dd>
                  </div>
                  <div>
                    <dt>Estado</dt>
                    <dd>{nombreEstado(detalle.estado)}</dd>
                  </div>
                  <div>
                    <dt>Total</dt>
                    <dd className="mono">{formatMoney(detalle.total)}</dd>
                  </div>
                  <div>
                    <dt>Saldo</dt>
                    <dd className="mono">{formatMoney(detalle.saldo)}</dd>
                  </div>
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
                      {(detalle.lineas || []).map((linea) => (
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

                {detalleError && (
                  <p className="form-error" role="alert">
                    {detalleError}
                  </p>
                )}

                <div className="modal-actions">
                  <button type="button" className="btn-ghost" onClick={() => setDetalle(null)}>
                    Cerrar
                  </button>
                  {Number(detalle.saldo) > 0 && (
                    <button
                      type="button"
                      className="btn btn-primary btn-inline"
                      onClick={() => navigate(`/pagos?venta=${detalle.id}`)}
                    >
                      Registrar pago
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {devolucion && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => !guardando && setDevolucion(null)}
        >
          <div
            className="modal modal--compra modal--fit"
            role="dialog"
            aria-modal="true"
            aria-labelledby="devolucion-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="devolucion-title">Registrar devolución</h2>
            <div className="pedido-revision__intro">
              <p className="pedido-revision__numero mono">{devolucion.numeroVenta}</p>
              <p className="page-subtitle">
                Lo devuelto vuelve al inventario. La venta no cambia y el dinero no se reembolsa.
              </p>
            </div>

            {Number(devolucion.saldo) > 0 ? (
              <p className="form-error" role="alert">
                Termine el pago de la venta antes de registrar la devolución.
              </p>
            ) : !puedeRegistrarDevolucion(devolucion) ? (
              <p className="form-error" role="alert">
                Ya se devolvió todo lo vendido en esta venta.
              </p>
            ) : (
              <form onSubmit={enviarDevolucion}>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Puede devolver</th>
                        <th>A devolver</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(devolucion.lineas || [])
                        .filter((linea) => pendienteDe(linea) > 0)
                        .map((linea) => (
                        <tr key={linea.id}>
                          <td>
                            {linea.codigo} — {linea.nombre}
                            {devolucionFields[`linea_${linea.id}`] && (
                              <em className="field-error" style={{ display: "block", marginTop: 4 }}>
                                {devolucionFields[`linea_${linea.id}`]}
                              </em>
                            )}
                          </td>
                          <td className="mono">{textoCantidad(pendienteDe(linea))}</td>
                          <td>
                            <input
                              className="devolucion-cantidad"
                              type="number"
                              min="0"
                              max={pendienteDe(linea)}
                              step="1"
                              inputMode="numeric"
                              aria-label={`Unidades a devolver de ${linea.nombre}`}
                              value={cantidades[linea.id] ?? ""}
                              onChange={(e) =>
                                setCantidades((actual) => ({
                                  ...actual,
                                  [linea.id]: e.target.value,
                                }))
                              }
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <label
                  className={`field ${devolucionFields.motivo ? "field--error" : ""}`}
                  style={{ marginTop: "1rem" }}
                >
                  <span>
                    Motivo <span className="field-required">*</span>
                  </span>
                  <textarea
                    rows={3}
                    maxLength={300}
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Por qué regresa el cliente estos productos"
                  />
                  {devolucionFields.motivo && (
                    <em className="field-error">{devolucionFields.motivo}</em>
                  )}
                </label>

                {devolucionError && (
                  <p className="form-error" role="alert">
                    {devolucionError}
                  </p>
                )}

                <div className="modal-actions">
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={guardando}
                    onClick={() => setDevolucion(null)}
                  >
                    Cerrar
                  </button>
                  <button type="submit" className="btn btn-primary btn-inline" disabled={guardando}>
                    {guardando ? (
                      <>
                        <Loader2 size={16} className="spin" />
                        Registrando…
                      </>
                    ) : (
                      "Registrar devolución"
                    )}
                  </button>
                </div>
              </form>
            )}

            {(Number(devolucion.saldo) > 0 || !puedeRegistrarDevolucion(devolucion)) && (
              <div className="modal-actions">
                <button type="button" className="btn-ghost" onClick={() => setDevolucion(null)}>
                  Cerrar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
