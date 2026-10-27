import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Bell } from "lucide-react";
import { listAlertasInventario, listSolicitudesClave } from "../api/client";

function formatFecha(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-GT", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function AlertasMenu({ esAdmin = false }) {
  const location = useLocation();
  const [alertas, setAlertas] = useState([]);
  const [claves, setClaves] = useState([]);
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
    if (!esAdmin) {
      setClaves([]);
      return;
    }
    try {
      const res = await listSolicitudesClave();
      setClaves(res.data || []);
    } catch {
      setClaves([]);
    }
  }, [esAdmin]);

  useEffect(() => {
    cargar();
  }, [cargar, location.pathname]);

  useEffect(() => {
    function refrescar() {
      cargar();
    }
    window.addEventListener("inventario-alertas", refrescar);
    window.addEventListener("claves-alertas", refrescar);
    window.addEventListener("focus", refrescar);
    return () => {
      window.removeEventListener("inventario-alertas", refrescar);
      window.removeEventListener("claves-alertas", refrescar);
      window.removeEventListener("focus", refrescar);
    };
  }, [cargar]);

  const total = alertas.length + claves.length;

  return (
    <div className="alertas">
      <button
        type="button"
        className="icon-btn alertas__trigger"
        aria-label={total > 0 ? `Alertas, ${total}` : "Alertas"}
        aria-expanded={abierto}
        title="Alertas"
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
          <div className="alertas__panel" role="dialog" aria-label="Alertas">
            <p className="alertas__title">Existencia mínima</p>
            {error && <p className="alertas__empty">{error}</p>}
            {!error && alertas.length === 0 && (
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
            {esAdmin && (
              <>
                <p className="alertas__title">Contraseñas</p>
                {claves.length === 0 ? (
                  <p className="alertas__empty">Nadie ha pedido restablecer su contraseña.</p>
                ) : (
                  claves.map((solicitud) => (
                    <div key={solicitud.id} className="alertas__item">
                      <strong>{solicitud.nombre} olvidó su contraseña</strong>
                      <span className="alertas__meta">{solicitud.correo}</span>
                      <span className="alertas__meta">{formatFecha(solicitud.fecha)}</span>
                    </div>
                  ))
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
