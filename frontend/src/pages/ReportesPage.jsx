import { useState } from "react";
import { Loader2 } from "lucide-react";
import AppShell from "../layout/AppShell";
import { reporteVentas } from "../api/client";

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

function fechaHoy() {
  const ahora = new Date();
  const mes = String(ahora.getMonth() + 1).padStart(2, "0");
  const dia = String(ahora.getDate()).padStart(2, "0");
  return `${ahora.getFullYear()}-${mes}-${dia}`;
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
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [error, setError] = useState("");
  const [generando, setGenerando] = useState(false);
  const [reporte, setReporte] = useState(null);

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
      subtitle="Elige el periodo y genera el reporte para ver cuánto se vendió."
    >
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

      {error && (
        <p className="form-error" role="alert" style={{ marginBottom: "1rem" }}>
          {error}
        </p>
      )}

      {reporte && (
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
    </AppShell>
  );
}
