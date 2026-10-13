import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import AppShell from "../layout/AppShell";
import { listMovimientosInventario, listProductos } from "../api/client";

const TIPOS = [
  { value: "", label: "Todos" },
  { value: "ENTRADA", label: "Entrada" },
  { value: "SALIDA", label: "Salida" },
  { value: "AJUSTE", label: "Ajuste" },
  { value: "DEVOLUCION", label: "Devolución" },
];

const FILTROS_VACIOS = {
  idProducto: "",
  tipo: "",
  fechaDesde: "",
  fechaHasta: "",
};

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

function tipoBadgeClass(tipo) {
  if (tipo === "ENTRADA") return "badge--success";
  if (tipo === "SALIDA") return "badge--danger";
  if (tipo === "AJUSTE") return "badge--warning";
  return "badge--info";
}

export default function InventarioPage() {
  const [movimientos, setMovimientos] = useState([]);
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filtros, setFiltros] = useState(FILTROS_VACIOS);
  const [aplicados, setAplicados] = useState(FILTROS_VACIOS);

  const hayFiltros = Boolean(
    aplicados.idProducto ||
      aplicados.tipo ||
      aplicados.fechaDesde ||
      aplicados.fechaHasta
  );

  const cargar = useCallback(async (query) => {
    setLoading(true);
    setError("");
    try {
      const res = await listMovimientosInventario(query);
      setMovimientos(res.data || []);
    } catch (err) {
      setError(err.message || "No se pudieron cargar los movimientos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    listProductos()
      .then((res) => setProductos(res.data || []))
      .catch(() => setProductos([]));
    cargar(FILTROS_VACIOS);
  }, [cargar]);

  function onFiltro(e) {
    const { name, value } = e.target;
    const esFecha = name === "fechaDesde" || name === "fechaHasta";

    if (esFecha && e.target.validity?.badInput) {
      setError("La fecha no es válida");
      return;
    }

    if (esFecha && value && !fechaCalendarioValida(value)) {
      setError("La fecha no es válida");
      return;
    }

    if (esFecha && value && value > fechaHoy()) {
      setError("La fecha no puede ser posterior a hoy");
      return;
    }

    if (
      name === "fechaDesde" &&
      value &&
      filtros.fechaHasta &&
      value > filtros.fechaHasta
    ) {
      setError("La fecha inicial no puede ser posterior a la fecha final");
      return;
    }

    if (
      name === "fechaHasta" &&
      value &&
      filtros.fechaDesde &&
      value < filtros.fechaDesde
    ) {
      setError("La fecha final no puede ser anterior a la fecha inicial");
      return;
    }

    setError("");
    setFiltros((prev) => ({ ...prev, [name]: value }));
  }

  function aplicar(e) {
    e.preventDefault();
    if (
      (filtros.fechaDesde && !fechaCalendarioValida(filtros.fechaDesde)) ||
      (filtros.fechaHasta && !fechaCalendarioValida(filtros.fechaHasta))
    ) {
      setError("La fecha no es válida");
      return;
    }
    if (
      (filtros.fechaDesde && filtros.fechaDesde > fechaHoy()) ||
      (filtros.fechaHasta && filtros.fechaHasta > fechaHoy())
    ) {
      setError("La fecha no puede ser posterior a hoy");
      return;
    }
    if (
      filtros.fechaDesde &&
      filtros.fechaHasta &&
      filtros.fechaDesde > filtros.fechaHasta
    ) {
      setError("La fecha inicial no puede ser posterior a la fecha final");
      return;
    }
    setAplicados(filtros);
    cargar(filtros);
  }

  function limpiar() {
    setFiltros(FILTROS_VACIOS);
    setAplicados(FILTROS_VACIOS);
    cargar(FILTROS_VACIOS);
  }

  return (
    <AppShell title="Movimientos">
      {error && (
        <p className="form-error" role="alert" style={{ marginBottom: "1rem" }}>
          {error}
        </p>
      )}

      <form className="mov-filtros" onSubmit={aplicar}>
        <label className="mov-filtros__control">
          <span>Producto</span>
          <select
            name="idProducto"
            value={filtros.idProducto}
            onChange={onFiltro}
          >
            <option value="">Todos</option>
            {productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.codigo} — {p.nombre}
              </option>
            ))}
          </select>
        </label>

        <label className="mov-filtros__control">
          <span>Tipo</span>
          <select name="tipo" value={filtros.tipo} onChange={onFiltro}>
            {TIPOS.map((t) => (
              <option key={t.value || "todos"} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </label>

        <label
          className="mov-filtros__control mov-filtros__control--date"
        >
          <span>Desde</span>
          <input
            type="date"
            name="fechaDesde"
            value={filtros.fechaDesde}
            min="2000-01-01"
            max={
              filtros.fechaHasta && filtros.fechaHasta < fechaHoy()
                ? filtros.fechaHasta
                : fechaHoy()
            }
            onChange={onFiltro}
          />
        </label>

        <label
          className="mov-filtros__control mov-filtros__control--date"
        >
          <span>Hasta</span>
          <input
            type="date"
            name="fechaHasta"
            value={filtros.fechaHasta}
            min={filtros.fechaDesde || "2000-01-01"}
            max={fechaHoy()}
            onChange={onFiltro}
          />
        </label>

        <div className="mov-filtros__actions">
          <button type="submit" className="mov-filtros__apply">
            Aplicar
          </button>
          <button type="button" className="mov-filtros__clear" onClick={limpiar}>
            Limpiar
          </button>
        </div>
      </form>

      <section className="card table-card">
        {loading ? (
          <p className="status-pending">
            <Loader2 size={16} className="spin" /> Cargando movimientos…
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Tipo</th>
                  <th>Cantidad</th>
                  <th>Fecha y hora</th>
                  <th>Usuario</th>
                  <th>Documento relacionado</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <strong>{m.nombreProducto}</strong>
                      <div className="cell-muted mono">{m.codigoProducto}</div>
                    </td>
                    <td>
                      <span className={`badge ${tipoBadgeClass(m.tipo)}`}>
                        {m.tipo}
                      </span>
                    </td>
                    <td className="mono">{m.cantidad}</td>
                    <td className="cell-nowrap">
                      {formatFecha(m.fechaMovimiento)}
                    </td>
                    <td>{m.usuarioNombre}</td>
                    <td className="mono">{m.numeroDocumento || "—"}</td>
                    <td>{m.motivo || "—"}</td>
                  </tr>
                ))}
                {movimientos.length === 0 && (
                  <tr>
                    <td colSpan={7} className="empty-cell">
                      {hayFiltros
                        ? "No hay movimientos con esos filtros."
                        : "Aún no hay movimientos de inventario."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AppShell>
  );
}
