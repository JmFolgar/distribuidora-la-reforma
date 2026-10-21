import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Loader2, Search } from "lucide-react";
import AppShell from "../layout/AppShell";
import {
  createPago,
  listMetodosPago,
  listPagos,
  listVentas,
} from "../api/client";
import { montoValido } from "../utils/validacion";

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

function centavos(valor) {
  return Math.round(Number(valor || 0) * 100);
}

const FORM_VACIO = {
  idVenta: "",
  idMetodoPago: "",
  monto: "",
  referencia: "",
};

export default function PagosPage() {
  const [params, setParams] = useSearchParams();
  const [ventas, setVentas] = useState([]);
  const [pagos, setPagos] = useState([]);
  const [metodos, setMetodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setError("");
    try {
      const [ventasRes, pagosRes, metodosRes] = await Promise.all([
        listVentas(),
        listPagos(),
        listMetodosPago(),
      ]);
      setVentas(ventasRes.data || []);
      setPagos(pagosRes.data || []);
      setMetodos(metodosRes.data || []);
    } catch (err) {
      setError(err.message || "No se pudieron cargar los pagos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const pendientes = useMemo(
    () => ventas.filter((venta) => centavos(venta.saldo) > 0),
    [ventas]
  );

  const pagosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return pagos;
    return pagos.filter(
      (pago) =>
        (pago.numeroPago || "").toLowerCase().includes(q) ||
        (pago.numeroVenta || "").toLowerCase().includes(q) ||
        (pago.clienteNombre || "").toLowerCase().includes(q)
    );
  }, [pagos, busqueda]);

  const ventaSeleccionada = pendientes.find(
    (venta) => String(venta.id) === String(form.idVenta)
  );
  const metodoSeleccionado = metodos.find(
    (metodo) => String(metodo.id) === String(form.idMetodoPago)
  );

  function abrir(idVenta = "") {
    setForm({ ...FORM_VACIO, idVenta: idVenta ? String(idVenta) : "" });
    setFieldErrors({});
    setFormError("");
    setModal(true);
  }

  function cerrar(forzar = false) {
    if (guardando && !forzar) return;
    setModal(false);
  }

  useEffect(() => {
    if (loading) return;
    const id = params.get("venta");
    if (!id) return;
    const venta = ventas.find((item) => String(item.id) === String(id));
    if (venta && centavos(venta.saldo) > 0) abrir(venta.id);
    setParams({}, { replace: true });
  }, [loading, params, setParams, ventas]);

  function validar() {
    const fields = {};
    if (!form.idVenta) fields.idVenta = "Seleccione una venta";
    if (!form.idMetodoPago) fields.idMetodoPago = "Seleccione una forma de pago";
    const monto = form.monto.trim();
    if (!monto) {
      fields.monto = "El monto es obligatorio";
    } else if (Number(monto) <= 0 || Number.isNaN(Number(monto))) {
      fields.monto = "El monto debe ser mayor a 0";
    } else if (!montoValido(monto)) {
      fields.monto = "Use como máximo 2 decimales";
    } else if (ventaSeleccionada && centavos(monto) > centavos(ventaSeleccionada.saldo)) {
      fields.monto = `El pago no puede ser mayor al saldo. El saldo pendiente es ${formatMoney(ventaSeleccionada.saldo)}`;
    }
    if (metodoSeleccionado?.requiereReferencia && !form.referencia.trim()) {
      fields.referencia = "Escriba la referencia del pago";
    }
    return fields;
  }

  async function guardar(event) {
    event.preventDefault();
    const fields = validar();
    setFieldErrors(fields);
    setFormError("");
    if (Object.keys(fields).length) return;
    setGuardando(true);
    try {
      const res = await createPago({
        idVenta: Number(form.idVenta),
        idMetodoPago: Number(form.idMetodoPago),
        monto: Number(form.monto),
        referencia: form.referencia.trim(),
      });
      const saldo = res.data?.saldo;
      setAviso(
        res.data?.pedidoCompletado
          ? "Pago registrado. El saldo quedó en cero y el pedido pasó a completado."
          : `Pago registrado. El saldo queda en ${formatMoney(saldo)}.`
      );
      setGuardando(false);
      cerrar(true);
      await cargar();
    } catch (err) {
      setFieldErrors(err.body?.fields || {});
      setFormError(err.message || "No se pudo registrar el pago");
      setGuardando(false);
    }
  }

  return (
    <AppShell
      title="Pagos"
      subtitle="Anota lo que el cliente ya pagó, en efectivo, tarjeta o transferencia. Puede ser una parte o el total."
      actions={
        <button
          type="button"
          className="btn btn-primary btn-inline"
          onClick={() => abrir()}
          disabled={loading || pendientes.length === 0}
        >
          Registrar pago
        </button>
      }
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

      <section className="card table-card" style={{ marginBottom: "1.25rem" }}>
        <h2 className="card-title" style={{ margin: "0 0 0.75rem" }}>
          Saldos pendientes
        </h2>
        {loading ? (
          <p className="status-pending">
            <Loader2 size={16} className="spin" /> Cargando…
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Venta</th>
                  <th>Cliente</th>
                  <th>Total</th>
                  <th>Saldo</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pendientes.map((venta) => (
                  <tr key={venta.id}>
                    <td className="mono">{venta.numeroVenta}</td>
                    <td>{venta.clienteNombre}</td>
                    <td className="mono">{formatMoney(venta.total)}</td>
                    <td className="mono">{formatMoney(venta.saldo)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn-action btn-action--success"
                        onClick={() => abrir(venta.id)}
                      >
                        Pagar
                      </button>
                    </td>
                  </tr>
                ))}
                {pendientes.length === 0 && (
                  <tr>
                    <td colSpan={5} className="empty-cell">
                      No hay saldos pendientes.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="toolbar">
        <label className="toolbar-search">
          <Search size={16} strokeWidth={1.75} aria-hidden />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por pago, venta o cliente…"
            aria-label="Buscar pagos"
          />
        </label>
        {!loading && (
          <span className="toolbar-meta">
            {pagosFiltrados.length} de {pagos.length}
          </span>
        )}
      </div>

      <section className="card table-card">
        {loading ? (
          <p className="status-pending">
            <Loader2 size={16} className="spin" /> Cargando pagos…
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Venta</th>
                  <th>Cliente</th>
                  <th>Fecha</th>
                  <th>Forma de pago</th>
                  <th>Monto</th>
                </tr>
              </thead>
              <tbody>
                {pagosFiltrados.map((pago) => (
                  <tr key={pago.id}>
                    <td className="mono">{pago.numeroPago}</td>
                    <td className="mono">{pago.numeroVenta}</td>
                    <td>{pago.clienteNombre}</td>
                    <td>{formatFecha(pago.fechaPago)}</td>
                    <td>{pago.metodoNombre}</td>
                    <td className="mono">{formatMoney(pago.monto)}</td>
                  </tr>
                ))}
                {pagosFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={6} className="empty-cell">
                      {pagos.length === 0
                        ? "Todavía no hay pagos registrados."
                        : "No se encontraron pagos con esa búsqueda."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modal && (
        <div className="modal-backdrop" role="presentation" onClick={cerrar}>
          <div
            className="modal modal--fit"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pago-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="pago-modal-title">Registrar pago</h2>
            <div className="pedido-revision__intro">
              <p className="page-subtitle">
                Anota cuánto paga el cliente ahora. Puede ser una parte o el total.
                Cuando ya no quede saldo, el pedido queda completado.
              </p>
            </div>
            <form onSubmit={guardar}>
              <label className={`field ${fieldErrors.idVenta ? "field--error" : ""}`}>
                <span>
                  Venta
                  <span className="field-required" aria-hidden="true">*</span>
                </span>
                <select
                  value={form.idVenta}
                  disabled={guardando}
                  onChange={(e) => {
                    setForm((actual) => ({ ...actual, idVenta: e.target.value }));
                    setFieldErrors((actual) => ({ ...actual, idVenta: undefined, monto: undefined }));
                  }}
                >
                  <option value="">Seleccione una venta</option>
                  {pendientes.map((venta) => (
                    <option key={venta.id} value={venta.id}>
                      {venta.numeroVenta} — {venta.clienteNombre} — saldo {formatMoney(venta.saldo)}
                    </option>
                  ))}
                </select>
                {fieldErrors.idVenta && <em className="field-error">{fieldErrors.idVenta}</em>}
              </label>

              {ventaSeleccionada && (
                <p className="field-help" style={{ marginTop: 0 }}>
                  Saldo pendiente: {formatMoney(ventaSeleccionada.saldo)} de {formatMoney(ventaSeleccionada.total)}.
                </p>
              )}

              <label className={`field ${fieldErrors.idMetodoPago ? "field--error" : ""}`}>
                <span>
                  Forma de pago
                  <span className="field-required" aria-hidden="true">*</span>
                </span>
                <select
                  value={form.idMetodoPago}
                  disabled={guardando}
                  onChange={(e) => {
                    setForm((actual) => ({ ...actual, idMetodoPago: e.target.value }));
                    setFieldErrors((actual) => ({ ...actual, idMetodoPago: undefined }));
                  }}
                >
                  <option value="">Seleccione una forma de pago</option>
                  {metodos.map((metodo) => (
                    <option key={metodo.id} value={metodo.id}>
                      {metodo.nombre}
                    </option>
                  ))}
                </select>
                {fieldErrors.idMetodoPago && (
                  <em className="field-error">{fieldErrors.idMetodoPago}</em>
                )}
              </label>

              <label className={`field ${fieldErrors.monto ? "field--error" : ""}`}>
                <span>
                  Monto
                  <span className="field-required" aria-hidden="true">*</span>
                </span>
                <input
                  inputMode="decimal"
                  value={form.monto}
                  disabled={guardando}
                  placeholder="0.00"
                  onChange={(e) => {
                    setForm((actual) => ({ ...actual, monto: e.target.value }));
                    setFieldErrors((actual) => ({ ...actual, monto: undefined }));
                  }}
                />
                {fieldErrors.monto ? (
                  <em className="field-error">{fieldErrors.monto}</em>
                ) : (
                  <span className="field-help">Mayor a 0 y con máximo 2 decimales.</span>
                )}
              </label>

              {metodoSeleccionado?.requiereReferencia && (
                <label className={`field ${fieldErrors.referencia ? "field--error" : ""}`}>
                  <span>
                    Referencia
                    <span className="field-required" aria-hidden="true">*</span>
                  </span>
                  <input
                    value={form.referencia}
                    maxLength={100}
                    disabled={guardando}
                    placeholder={
                      metodoSeleccionado.codigo === "TARJETA"
                        ? "Número de autorización"
                        : "Número de la transferencia"
                    }
                    onChange={(e) => {
                      setForm((actual) => ({ ...actual, referencia: e.target.value }));
                      setFieldErrors((actual) => ({ ...actual, referencia: undefined }));
                    }}
                  />
                  {fieldErrors.referencia ? (
                    <em className="field-error">{fieldErrors.referencia}</em>
                  ) : (
                    <span className="field-help">
                      {metodoSeleccionado.codigo === "TARJETA"
                        ? "El número de autorización que sale en el comprobante. Solo se anota."
                        : "El número de la transferencia. Solo se anota."}
                    </span>
                  )}
                </label>
              )}

              {formError && (
                <p className="form-error" role="alert">
                  {formError}
                </p>
              )}

              <div className="modal-actions">
                <button type="button" className="btn-ghost" onClick={cerrar} disabled={guardando}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary btn-inline" disabled={guardando}>
                  {guardando ? (
                    <>
                      <Loader2 size={16} className="spin" />
                      Registrando…
                    </>
                  ) : (
                    "Registrar pago"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppShell>
  );
}
