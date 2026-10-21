import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, Loader2, Search } from "lucide-react";
import AppShell from "../layout/AppShell";
import { getVenta, listVentas } from "../api/client";

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

function nombreEstado(estado) {
  if (estado === "FINALIZADA") return "Finalizada";
  if (estado === "CANCELADA") return "Cancelada";
  if (estado === "BORRADOR") return "Borrador";
  return estado || "—";
}

export default function VentasPage() {
  const navigate = useNavigate();
  const [ventas, setVentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [detalle, setDetalle] = useState(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [detalleError, setDetalleError] = useState("");

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
    </AppShell>
  );
}
