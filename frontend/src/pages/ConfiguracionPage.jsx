import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import AppShell from "../layout/AppShell";
import { getDescuentoConfig, guardarDescuentoConfig } from "../api/client";

function mensajePorcentaje(valor) {
  if (String(valor).trim() === "") return "Escriba el porcentaje";
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return "El porcentaje debe ser un número";
  if (numero < 0 || numero > 100) return "El porcentaje debe estar entre 0 y 100";
  if (Math.abs(numero * 100 - Math.round(numero * 100)) > 1e-6) {
    return "El porcentaje puede tener como máximo 2 decimales";
  }
  return "";
}

export default function ConfiguracionPage() {
  const [porcentaje, setPorcentaje] = useState("");
  const [cargando, setCargando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    let activo = true;
    getDescuentoConfig()
      .then((res) => {
        if (activo) setPorcentaje(String(res.data.porcentaje));
      })
      .catch((err) => {
        if (activo) setError(err.message || "No se pudo consultar el porcentaje");
      })
      .finally(() => {
        if (activo) setCargando(false);
      });
    return () => {
      activo = false;
    };
  }, []);

  async function guardar(event) {
    event.preventDefault();
    const mensaje = mensajePorcentaje(porcentaje);
    if (mensaje) {
      setAviso("");
      setError(mensaje);
      return;
    }
    setGuardando(true);
    setError("");
    setAviso("");
    try {
      const res = await guardarDescuentoConfig(Number(porcentaje));
      setPorcentaje(String(res.data.porcentaje));
      setAviso("Guardado. Solo los pedidos nuevos usarán este porcentaje.");
    } catch (err) {
      setError(err.message || "No se pudo guardar el porcentaje");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <AppShell
      title="Configuración"
      subtitle="Define hasta qué porcentaje de descuento puede llevar un pedido nuevo sin aprobación. Los pedidos ya enviados no cambian."
    >
      {cargando ? (
        <div className="status-pending">
          <Loader2 className="spin" size={18} />
          Cargando configuración…
        </div>
      ) : (
        <form className="card" style={{ maxWidth: 480 }} onSubmit={guardar}>
          <h2 className="card-title">Descuento sin aprobación</h2>
          <p className="card-text">
            Si el descuento del pedido nuevo es mayor que este valor, queda pendiente de que un supervisor lo apruebe.
          </p>
          <label className="field">
            <span>Porcentaje</span>
            <input
              inputMode="decimal"
              value={porcentaje}
              onChange={(e) => {
                setPorcentaje(e.target.value);
                setError("");
                setAviso("");
              }}
            />
          </label>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          {aviso ? (
            <p className="form-ok" role="status">
              {aviso}
            </p>
          ) : null}
          <div style={{ marginTop: "1rem" }}>
            <button type="submit" className="btn btn-save" disabled={guardando}>
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
    </AppShell>
  );
}
