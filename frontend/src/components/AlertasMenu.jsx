import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Bell } from "lucide-react";
import { listAlertasInventario } from "../api/client";

export default function AlertasMenu() {
  const location = useLocation();
  const [alertas, setAlertas] = useState([]);
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState("");

  const cargar = useCallback(async () => {
    try {
      const res = await listAlertasInventario();
      setAlertas(res.data || []);
      setError("");
    } catch (err) {
      setError(err.message || "No se pudieron cargar las alertas");
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar, location.pathname]);

  useEffect(() => {
    function refrescar() {
      cargar();
    }
    window.addEventListener("inventario-alertas", refrescar);
    window.addEventListener("focus", refrescar);
    return () => {
      window.removeEventListener("inventario-alertas", refrescar);
      window.removeEventListener("focus", refrescar);
    };
  }, [cargar]);

  const total = alertas.length;

  return (
    <div className="alertas">
      <button
        type="button"
        className="icon-btn alertas__trigger"
        aria-label={
          total > 0
            ? `Alertas de existencia, ${total}`
            : "Alertas de existencia"
        }
        aria-expanded={abierto}
        title="Existencia mínima"
        onClick={() => {
          setAbierto((v) => !v);
          cargar();
        }}
      >
        <Bell size={18} strokeWidth={1.75} />
        {total > 0 && (
          <span className="alertas__badge">{total > 99 ? "99+" : total}</span>
        )}
      </button>

      {abierto && (
        <>
          <button
            type="button"
            className="alertas__scrim"
            aria-label="Cerrar alertas"
            onClick={() => setAbierto(false)}
          />
          <div className="alertas__panel" role="dialog" aria-label="Productos en existencia mínima">
            <p className="alertas__title">Existencia mínima</p>
            {error && <p className="alertas__empty">{error}</p>}
            {!error && total === 0 && (
              <p className="alertas__empty">No hay productos en el mínimo.</p>
            )}
            {!error &&
              alertas.map((a) => (
                <div key={a.id} className="alertas__item">
                  <strong>{a.nombre}</strong>
                  <span className="alertas__codigo mono">{a.codigo}</span>
                  <span className="alertas__meta">
                    Existencia {a.existencia} · Mínimo {a.minimo}
                  </span>
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
