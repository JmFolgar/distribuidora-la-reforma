import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import AppShell from "../layout/AppShell";
import { listMovimientosInventario } from "../api/client";

function formatFecha(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-GT", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function tipoBadgeClass(tipo) {
  if (tipo === "ENTRADA") return "badge--success";
  if (tipo === "SALIDA") return "badge--danger";
  return "badge--info";
}

export default function InventarioPage() {
  const [movimientos, setMovimientos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return movimientos;
    return movimientos.filter(
      (m) =>
        (m.codigoProducto || "").toLowerCase().includes(q) ||
        (m.nombreProducto || "").toLowerCase().includes(q) ||
        (m.numeroDocumento || "").toLowerCase().includes(q) ||
        (m.motivo || "").toLowerCase().includes(q) ||
        (m.usuarioNombre || "").toLowerCase().includes(q)
    );
  }, [movimientos, busqueda]);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await listMovimientosInventario();
      setMovimientos(res.data || []);
    } catch (err) {
      setError(err.message || "No se pudieron cargar los movimientos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <AppShell
      title="Inventario"
      subtitle="Movimientos de existencia: entradas, salidas y ajustes registrados en el sistema."
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
            placeholder="Buscar por producto, documento o usuario…"
            aria-label="Buscar movimientos"
          />
        </label>
        {!loading && (
          <span className="toolbar-meta">
            {filtrados.length} de {movimientos.length}
          </span>
        )}
      </div>

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
                  <th>Fecha y hora</th>
                  <th>Tipo</th>
                  <th>Producto</th>
                  <th>Cantidad</th>
                  <th>Documento</th>
                  <th>Motivo</th>
                  <th>Usuario</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((m) => (
                  <tr key={m.id}>
                    <td className="cell-nowrap">{formatFecha(m.fechaMovimiento)}</td>
                    <td>
                      <span className={`badge ${tipoBadgeClass(m.tipo)}`}>
                        {m.tipo}
                      </span>
                    </td>
                    <td>
                      <strong>{m.nombreProducto}</strong>
                      <div className="cell-muted mono">{m.codigoProducto}</div>
                    </td>
                    <td className="mono">{m.cantidad}</td>
                    <td className="mono">{m.numeroDocumento || "—"}</td>
                    <td>{m.motivo || "—"}</td>
                    <td>{m.usuarioNombre}</td>
                  </tr>
                ))}
                {filtrados.length === 0 && (
                  <tr>
                    <td colSpan={7} className="empty-cell">
                      {movimientos.length === 0
                        ? "Aún no hay movimientos de inventario."
                        : "No se encontraron movimientos con esa búsqueda."}
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
