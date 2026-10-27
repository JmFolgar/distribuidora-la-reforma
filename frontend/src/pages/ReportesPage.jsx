import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import AppShell from "../layout/AppShell";
import { listProveedores, reporteCompras, reporteProductosBajoMinimo, reporteVentas } from "../api/client";

function formatMoney(value) {
  return Number(value || 0).toLocaleString("es-GT", {
    style: "currency",
    currency: "GTQ",
    minimumFractionDigits: 2,
  });
}

function formatCantidad(value) {
  const n = Number(value || 0);
  if (Number.isInteger(n)) return String(n);
  return n.toLocaleString("es-GT", { maximumFractionDigits: 3 });
}

function formatFecha(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-GT", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function fechaHoy() {
  const ahora = new Date();
  const mes = String(ahora.getMonth() + 1).padStart(2, "0");
  const dia = String(ahora.getDate()).padStart(2, "0");
  return `${ahora.getFullYear()}-${mes}-${dia}`;
}

function claseEstadoCompra(estado) {
  if (estado === "Pendiente") return "badge--warning";
  if (estado === "Recibida") return "badge--success";
  if (estado === "Cancelada") return "badge--danger";
  return "badge--info";
}

function fechaCalendarioValida(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [anio, mes, dia] = value.split("-").map(Number);
  if (anio < 2000 || anio > 2100) return false;
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia
  );
}

export default function ReportesPage() {
  const [tipo, setTipo] = useState("ventas");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [error, setError] = useState("");
  const [generando, setGenerando] = useState(false);
  const [reporte, setReporte] = useState(null);
  const [minimos, setMinimos] = useState(null);
  const [cargandoMinimos, setCargandoMinimos] = useState(false);
  const [errorMinimos, setErrorMinimos] = useState("");
  const [aperturaMinimos, setAperturaMinimos] = useState(0);
  const [proveedores, setProveedores] = useState([]);
  const [compraDesde, setCompraDesde] = useState("");
  const [compraHasta, setCompraHasta] = useState("");
  const [compraProveedor, setCompraProveedor] = useState("");
  const [errorCompras, setErrorCompras] = useState("");
  const [generandoCompras, setGenerandoCompras] = useState(false);
  const [reporteComprasData, setReporteComprasData] = useState(null);

  function validar(inicio, fin) {
    if (!inicio || !fin) return "Indique la fecha inicial y la fecha final";
    if (
      (inicio && !fechaCalendarioValida(inicio)) ||
      (fin && !fechaCalendarioValida(fin))
    ) {
      return "La fecha no es válida";
    }
    if (inicio > fechaHoy() || fin > fechaHoy()) {
      return "La fecha no puede ser posterior a hoy";
    }
    if (inicio > fin) return "La fecha inicial no puede ser posterior a la fecha final";
    return "";
  }

  function cambiarDesde(valor, input) {
    if (input?.validity?.badInput || (valor && !fechaCalendarioValida(valor))) {
      setError("La fecha no es válida");
      return;
    }
    if (valor && valor > fechaHoy()) {
      setError("La fecha no puede ser posterior a hoy");
      return;
    }
    if (valor && hasta && valor > hasta) {
      setError("La fecha inicial no puede ser posterior a la fecha final");
      return;
    }
    setError("");
    setDesde(valor);
    setReporte(null);
  }

  function cambiarHasta(valor, input) {
    if (input?.validity?.badInput || (valor && !fechaCalendarioValida(valor))) {
      setError("La fecha no es válida");
      return;
    }
    if (valor && valor > fechaHoy()) {
      setError("La fecha no puede ser posterior a hoy");
      return;
    }
    if (valor && desde && valor < desde) {
      setError("La fecha final no puede ser anterior a la fecha inicial");
      return;
    }
    setError("");
    setHasta(valor);
    setReporte(null);
  }

  useEffect(() => {
    if (tipo !== "compras" || proveedores.length) return undefined;
    let activo = true;
    listProveedores()
      .then((res) => {
        if (activo) setProveedores(res.data || []);
      })
      .catch(() => {
        if (activo) setProveedores([]);
      });
    return () => {
      activo = false;
    };
  }, [tipo, proveedores.length]);

  function cambiarCompraDesde(valor, input) {
    if (input?.validity?.badInput || (valor && !fechaCalendarioValida(valor))) {
      setErrorCompras("La fecha no es válida");
      return;
    }
    if (valor && valor > fechaHoy()) {
      setErrorCompras("La fecha no puede ser posterior a hoy");
      return;
    }
    if (valor && compraHasta && valor > compraHasta) {
      setErrorCompras("La fecha inicial no puede ser posterior a la fecha final");
      return;
    }
    setErrorCompras("");
    setCompraDesde(valor);
    setReporteComprasData(null);
  }

  function cambiarCompraHasta(valor, input) {
    if (input?.validity?.badInput || (valor && !fechaCalendarioValida(valor))) {
      setErrorCompras("La fecha no es válida");
      return;
    }
    if (valor && valor > fechaHoy()) {
      setErrorCompras("La fecha no puede ser posterior a hoy");
      return;
    }
    if (valor && compraDesde && valor < compraDesde) {
      setErrorCompras("La fecha final no puede ser anterior a la fecha inicial");
      return;
    }
    setErrorCompras("");
    setCompraHasta(valor);
    setReporteComprasData(null);
  }

  async function generarCompras(event) {
    event.preventDefault();
    const mensaje = validar(compraDesde, compraHasta);
    if (mensaje) {
      setErrorCompras(mensaje);
      setReporteComprasData(null);
      return;
    }
    setGenerandoCompras(true);
    setErrorCompras("");
    try {
      const res = await reporteCompras({
        desde: compraDesde,
        hasta: compraHasta,
        idProveedor: compraProveedor,
      });
      setReporteComprasData(res.data);
    } catch (err) {
      setReporteComprasData(null);
      setErrorCompras(err.message || "No se pudo generar el reporte");
    } finally {
      setGenerandoCompras(false);
    }
  }

  useEffect(() => {
    if (tipo !== "minimos") return undefined;
    let activo = true;
    setCargandoMinimos(true);
    setErrorMinimos("");
    reporteProductosBajoMinimo()
      .then((res) => {
        if (activo) setMinimos(res.data.productos);
      })
      .catch((err) => {
        if (!activo) return;
        setMinimos([]);
        setErrorMinimos(err.message || "No se pudo cargar el reporte");
      })
      .finally(() => {
        if (activo) setCargandoMinimos(false);
      });
    return () => {
      activo = false;
    };
  }, [tipo, aperturaMinimos]);

  async function generar(event) {
    event.preventDefault();
    const mensaje = validar(desde, hasta);
    if (mensaje) {
      setError(mensaje);
      setReporte(null);
      return;
    }
    setGenerando(true);
    setError("");
    try {
      const res = await reporteVentas({ desde, hasta });
      setReporte(res.data);
    } catch (err) {
      setReporte(null);
      setError(err.message || "No se pudo generar el reporte");
    } finally {
      setGenerando(false);
    }
  }

  return (
    <AppShell
      title="Reportes"
      subtitle={
        tipo === "ventas"
          ? "Elige el periodo y genera el reporte para ver cuánto se vendió."
          : tipo === "compras"
            ? "Elige el periodo y, si quieres, un proveedor, para ver cuánto se le compró."
            : "Productos activos con existencia igual o menor a su mínimo."
      }
    >
      <div className="reporte-elige" role="tablist">
        <button
          type="button"
          role="tab"
          className={tipo === "ventas" ? "is-active" : ""}
          aria-selected={tipo === "ventas"}
          onClick={() => setTipo("ventas")}
        >
          Ventas
        </button>
        <button
          type="button"
          role="tab"
          className={tipo === "minimos" ? "is-active" : ""}
          aria-selected={tipo === "minimos"}
          onClick={() => {
            setTipo("minimos");
            setAperturaMinimos((n) => n + 1);
          }}
        >
          Productos bajo el mínimo
        </button>
        <button
          type="button"
          role="tab"
          className={tipo === "compras" ? "is-active" : ""}
          aria-selected={tipo === "compras"}
          onClick={() => setTipo("compras")}
        >
          Compras por proveedor
        </button>
      </div>

      {tipo === "ventas" && (
      <form className="mov-filtros mov-filtros--reporte" onSubmit={generar}>
        <label className="mov-filtros__control mov-filtros__control--date">
          <span>Desde</span>
          <input
            type="date"
            value={desde}
            min="2000-01-01"
            max={hasta && hasta < fechaHoy() ? hasta : fechaHoy()}
            onChange={(e) => cambiarDesde(e.target.value, e.target)}
          />
        </label>
        <label className="mov-filtros__control mov-filtros__control--date">
          <span>Hasta</span>
          <input
            type="date"
            value={hasta}
            min={desde || "2000-01-01"}
            max={fechaHoy()}
            onChange={(e) => cambiarHasta(e.target.value, e.target)}
          />
        </label>
        <div className="mov-filtros__actions">
          <button type="submit" className="btn btn-primary btn-inline" disabled={generando}>
            {generando ? (
              <>
                <Loader2 size={16} className="spin" />
                Generando…
              </>
            ) : (
              "Generar reporte"
            )}
          </button>
        </div>
      </form>
      )}

      {tipo === "ventas" && error && (
        <p className="form-error" role="alert" style={{ marginBottom: "1rem" }}>
          {error}
        </p>
      )}

      {tipo === "ventas" && reporte && (
        <section className="card table-card">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Número de venta</th>
                  <th>Cliente</th>
                  <th>Descuento</th>
                  <th>Total</th>
                  <th>Quién vendió</th>
                </tr>
              </thead>
              <tbody>
                {reporte.ventas.map((venta) => (
                  <tr key={venta.id}>
                    <td>{formatFecha(venta.fecha)}</td>
                    <td className="mono">{venta.numeroVenta}</td>
                    <td>{venta.cliente}</td>
                    <td className="mono">{Number(venta.descuento)}%</td>
                    <td className="mono">{formatMoney(venta.total)}</td>
                    <td>{venta.vendidoPor}</td>
                  </tr>
                ))}
                {reporte.ventas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="empty-cell">
                      No hay ventas en ese periodo.
                    </td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4}>Total general</td>
                  <td className="mono">{formatMoney(reporte.totalGeneral)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {tipo === "compras" && (
        <form className="mov-filtros mov-filtros--reporte" onSubmit={generarCompras}>
          <label className="mov-filtros__control mov-filtros__control--proveedor">
            <span>Proveedor</span>
            <select
              value={compraProveedor}
              onChange={(e) => {
                setCompraProveedor(e.target.value);
                setReporteComprasData(null);
                setErrorCompras("");
              }}
            >
              <option value="">Todos</option>
              {proveedores.map((proveedor) => (
                <option key={proveedor.id} value={proveedor.id}>
                  {proveedor.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="mov-filtros__control mov-filtros__control--date">
            <span>Desde</span>
            <input
              type="date"
              value={compraDesde}
              min="2000-01-01"
              max={compraHasta && compraHasta < fechaHoy() ? compraHasta : fechaHoy()}
              onChange={(e) => cambiarCompraDesde(e.target.value, e.target)}
            />
          </label>
          <label className="mov-filtros__control mov-filtros__control--date">
            <span>Hasta</span>
            <input
              type="date"
              value={compraHasta}
              min={compraDesde || "2000-01-01"}
              max={fechaHoy()}
              onChange={(e) => cambiarCompraHasta(e.target.value, e.target)}
            />
          </label>
          <div className="mov-filtros__actions">
            <button type="submit" className="btn btn-primary btn-inline" disabled={generandoCompras}>
              {generandoCompras ? (
                <>
                  <Loader2 size={16} className="spin" />
                  Generando…
                </>
              ) : (
                "Generar reporte"
              )}
            </button>
          </div>
        </form>
      )}

      {tipo === "compras" && errorCompras && (
        <p className="form-error" role="alert" style={{ marginBottom: "1rem" }}>
          {errorCompras}
        </p>
      )}

      {tipo === "compras" && reporteComprasData && (
        <section className="card table-card">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Proveedor</th>
                  <th>Número de compra</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {reporteComprasData.grupos.flatMap((grupo) => {
                  const filas = grupo.compras.map((compra) => (
                    <tr key={compra.id}>
                      <td>{grupo.proveedor}</td>
                      <td className="mono">{compra.numeroCompra}</td>
                      <td>{formatFecha(compra.fecha)}</td>
                      <td>
                        <span className={`badge ${claseEstadoCompra(compra.estado)}`}>{compra.estado}</span>
                      </td>
                      <td className="mono">{formatMoney(compra.total)}</td>
                    </tr>
                  ));
                  if (!reporteComprasData.idProveedor) {
                    filas.push(
                      <tr key={`total-${grupo.idProveedor}`} className="reporte-subtotal">
                        <td colSpan={4}>Total {grupo.proveedor}</td>
                        <td className="mono">{formatMoney(grupo.total)}</td>
                      </tr>
                    );
                  }
                  return filas;
                })}
                {reporteComprasData.grupos.length === 0 && (
                  <tr>
                    <td colSpan={5} className="empty-cell">
                      No hay resultados
                    </td>
                  </tr>
                )}
              </tbody>
              {reporteComprasData.grupos.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={4}>Total general</td>
                    <td className="mono">{formatMoney(reporteComprasData.totalGeneral)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </section>
      )}

      {tipo === "minimos" && errorMinimos && (
        <p className="form-error" role="alert" style={{ marginBottom: "1rem" }}>
          {errorMinimos}
        </p>
      )}

      {tipo === "minimos" && cargandoMinimos && (
        <p className="status-pending">
          <Loader2 size={16} className="spin" /> Cargando reporte…
        </p>
      )}

      {tipo === "minimos" && !cargandoMinimos && minimos && (
        <section className="card table-card">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Producto</th>
                  <th>Existencia</th>
                  <th>Mínimo</th>
                  <th>Falta para el mínimo</th>
                </tr>
              </thead>
              <tbody>
                {minimos.map((producto) => (
                  <tr key={producto.id}>
                    <td className="mono">{producto.codigo}</td>
                    <td>{producto.nombre}</td>
                    <td className="mono">{formatCantidad(producto.existencia)}</td>
                    <td className="mono">{formatCantidad(producto.minimo)}</td>
                    <td className="mono">{formatCantidad(producto.faltante)}</td>
                  </tr>
                ))}
                {minimos.length === 0 && (
                  <tr>
                    <td colSpan={5} className="empty-cell">
                      No hay productos bajo el mínimo.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </AppShell>
  );
}
