import { useCallback, useEffect, useState } from "react";
import { Eye, Loader2 } from "lucide-react";
import AppShell from "../layout/AppShell";
import { listAuditoria } from "../api/client";

const ETIQUETAS = {
  nombre: "Nombre",
  nit: "NIT",
  correo: "Correo",
  telefono: "Teléfono",
  precioVenta: "Precio de venta",
  existenciaMinima: "Existencia mínima",
  rol: "Rol",
  estado: "Estado",
  descuento: "Descuento",
  motivo: "Motivo",
  resueltoPor: "Resuelto por",
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

function entradas(valor) {
  if (!valor || typeof valor !== "object") return [];
  return Object.entries(valor).filter(([clave, dato]) => clave !== "registro" && dato != null && dato !== "");
}

export default function AuditoriaPage() {
  const [eventos, setEventos] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [modulos, setModulos] = useState([]);
  const [filtros, setFiltros] = useState({ usuario: "", modulo: "", desde: "", hasta: "" });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detalle, setDetalle] = useState(null);

  const cargar = useCallback(async (actuales) => {
    setError("");
    try {
      const res = await listAuditoria(actuales);
      setEventos(res.data || []);
      setUsuarios(res.filtros?.usuarios || []);
      setModulos(res.filtros?.modulos || []);
    } catch (err) {
      setError(err.message || "No se pudo consultar la auditoría");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar(filtros);
  }, [cargar, filtros]);

  function cambiar(campo, valor, input) {
    const esFecha = campo === "desde" || campo === "hasta";

    if (esFecha && input?.validity?.badInput) {
      setError("La fecha no es válida");
      return;
    }

    if (esFecha && valor && !fechaCalendarioValida(valor)) {
      setError("La fecha no es válida");
      return;
    }

    if (esFecha && valor && valor > fechaHoy()) {
      setError("La fecha no puede ser posterior a hoy");
      return;
    }

    if (campo === "desde" && valor && filtros.hasta && valor > filtros.hasta) {
      setError("La fecha inicial no puede ser posterior a la fecha final");
      return;
    }

    if (campo === "hasta" && valor && filtros.desde && valor < filtros.desde) {
      setError("La fecha final no puede ser anterior a la fecha inicial");
      return;
    }

    setError("");
    setFiltros((actual) => ({ ...actual, [campo]: valor }));
  }

  const anterior = entradas(detalle?.valorAnterior);
  const nuevo = entradas(detalle?.valorNuevo);

  return (
    <AppShell
      title="Auditoría"
      subtitle="Consulta quién hizo cada operación, cuándo y en qué módulo. Estos registros no se pueden cambiar ni borrar."
    >
      {error && (
        <p className="form-error" role="alert" style={{ marginBottom: "1rem" }}>
          {error}
        </p>
      )}

      <div className="toolbar" style={{ alignItems: "end", flexWrap: "wrap" }}>
        <label className="field" style={{ minWidth: 200 }}>
          <span>Usuario</span>
          <select value={filtros.usuario} onChange={(e) => cambiar("usuario", e.target.value)}>
            <option value="">Todos</option>
            {usuarios.map((usuario) => (
              <option key={usuario.id} value={usuario.id}>
                {usuario.nombreUsuario}
                {usuario.nombre ? ` — ${usuario.nombre}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ minWidth: 180 }}>
          <span>Módulo</span>
          <select value={filtros.modulo} onChange={(e) => cambiar("modulo", e.target.value)}>
            <option value="">Todos</option>
            {modulos.map((modulo) => (
              <option key={modulo.id} value={modulo.id}>
                {modulo.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="field" style={{ minWidth: 150 }}>
          <span>Desde</span>
          <input
            type="date"
            value={filtros.desde}
            min="2000-01-01"
            max={
              filtros.hasta && filtros.hasta < fechaHoy()
                ? filtros.hasta
                : fechaHoy()
            }
            onChange={(e) => cambiar("desde", e.target.value, e.target)}
          />
        </label>
        <label className="field" style={{ minWidth: 150 }}>
          <span>Hasta</span>
          <input
            type="date"
            value={filtros.hasta}
            min={filtros.desde || "2000-01-01"}
            max={fechaHoy()}
            onChange={(e) => cambiar("hasta", e.target.value, e.target)}
          />
        </label>
      </div>

      <section className="card table-card">
        {loading ? (
          <p className="status-pending">
            <Loader2 size={16} className="spin" /> Cargando auditoría…
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Usuario</th>
                  <th>Fecha y hora</th>
                  <th>Módulo</th>
                  <th>Acción</th>
                  <th>Registro</th>
                  <th>Detalle</th>
                </tr>
              </thead>
              <tbody>
                {eventos.map((evento) => (
                  <tr key={evento.id}>
                    <td>
                      <span className="mono">{evento.nombreUsuario}</span>
                      {evento.nombre && (
                        <span className="field-help" style={{ display: "block" }}>
                          {evento.nombre}
                        </span>
                      )}
                    </td>
                    <td>{formatFecha(evento.fecha)}</td>
                    <td>{evento.moduloNombre}</td>
                    <td>{evento.accionNombre}</td>
                    <td className="mono">{evento.registro}</td>
                    <td>
                      <button
                        type="button"
                        className="btn-action btn-action--edit"
                        onClick={() => setDetalle(evento)}
                      >
                        <Eye size={14} strokeWidth={1.75} />
                        Ver
                      </button>
                    </td>
                  </tr>
                ))}
                {eventos.length === 0 && (
                  <tr>
                    <td colSpan={6} className="empty-cell">
                      No hay operaciones con esos filtros.
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
            className="modal modal--fit"
            role="dialog"
            aria-modal="true"
            aria-labelledby="auditoria-detalle-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="auditoria-detalle-title">Operación</h2>
            <div className="pedido-revision__intro">
              <p className="pedido-revision__numero mono">{detalle.registro}</p>
              <p className="page-subtitle">
                Este registro solo se consulta. No se puede modificar ni borrar.
              </p>
            </div>
            <dl className="pedido-ficha">
              <div>
                <dt>Usuario</dt>
                <dd>
                  {detalle.nombreUsuario}
                  {detalle.nombre ? ` — ${detalle.nombre}` : ""}
                </dd>
              </div>
              <div>
                <dt>Fecha y hora</dt>
                <dd>{formatFecha(detalle.fecha)}</dd>
              </div>
              <div>
                <dt>Módulo</dt>
                <dd>{detalle.moduloNombre}</dd>
              </div>
              <div>
                <dt>Acción</dt>
                <dd>{detalle.accionNombre}</dd>
              </div>
            </dl>
            {detalle.mensaje && <p className="field-help">{detalle.mensaje}</p>}
            {anterior.length > 0 && (
              <>
                <h3 className="card-title">Valor anterior</h3>
                <dl className="pedido-ficha">
                  {anterior.map(([clave, valor]) => (
                    <div key={clave}>
                      <dt>{ETIQUETAS[clave] || clave}</dt>
                      <dd>{String(valor)}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
            {nuevo.length > 0 && (
              <>
                <h3 className="card-title">Valor nuevo</h3>
                <dl className="pedido-ficha">
                  {nuevo.map(([clave, valor]) => (
                    <div key={clave}>
                      <dt>{ETIQUETAS[clave] || clave}</dt>
                      <dd>{String(valor)}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
            <div className="modal-actions">
              <button type="button" className="btn-ghost" onClick={() => setDetalle(null)}>
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
