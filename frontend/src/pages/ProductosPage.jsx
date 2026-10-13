import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Search } from "lucide-react";
import AppShell from "../layout/AppShell";
import { useAuth } from "../auth/AuthContext";
import {
  createProducto,
  listCategorias,
  listProductos,
  notificarAlertas,
  updateProducto,
} from "../api/client";

const EMPTY_FORM = {
  codigo: "",
  nombre: "",
  idCategoria: "",
  precioVenta: "",
  existenciaMinima: "0",
  existencia: "0",
};

function formatMoney(value) {
  return Number(value || 0).toLocaleString("es-GT", {
    style: "currency",
    currency: "GTQ",
    minimumFractionDigits: 2,
  });
}

function validarFormulario(form, modo) {
  const fields = {};
  if (modo === "crear") {
    if (!form.codigo.trim()) fields.codigo = "El código es obligatorio";
    if (!form.nombre.trim()) fields.nombre = "El nombre es obligatorio";
    if (!form.idCategoria) fields.idCategoria = "Seleccione una categoría";
  }

  const precio = Number(form.precioVenta);
  if (form.precioVenta === "" || Number.isNaN(precio)) {
    fields.precioVenta = "El precio de venta es obligatorio";
  } else if (precio <= 0) {
    fields.precioVenta = "El precio debe ser mayor a 0";
  }

  const minimo = Number(form.existenciaMinima);
  if (form.existenciaMinima === "" || Number.isNaN(minimo)) {
    fields.existenciaMinima = "La existencia mínima es obligatoria";
  } else if (minimo < 0) {
    fields.existenciaMinima = "La existencia mínima no puede ser negativa";
  }

  return fields;
}

export default function ProductosPage() {
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === "ADMINISTRADOR";

  const [productos, setProductos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null); // 'crear' | 'editar' | null
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  const productosFiltrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return productos;
    return productos.filter(
      (p) =>
        (p.codigo || "").toLowerCase().includes(q) ||
        (p.nombre || "").toLowerCase().includes(q) ||
        (p.categoria || "").toLowerCase().includes(q)
    );
  }, [productos, busqueda]);

  const cargar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [prodRes, catRes] = await Promise.all([
        listProductos(),
        listCategorias(),
      ]);
      setProductos(prodRes.data || []);
      setCategorias(catRes.data || []);
    } catch (err) {
      setError(err.message || "No se pudo cargar la lista de productos");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function abrirCrear() {
    setModal("crear");
    setEditando(null);
    setForm({
      ...EMPTY_FORM,
      idCategoria: categorias[0]?.id ? String(categorias[0].id) : "",
    });
    setFieldErrors({});
    setFormError("");
  }

  function abrirEditar(producto) {
    setModal("editar");
    setEditando(producto);
    setForm({
      codigo: producto.codigo || "",
      nombre: producto.nombre || "",
      idCategoria: producto.idCategoria ? String(producto.idCategoria) : "",
      precioVenta: String(producto.precioVenta ?? ""),
      existenciaMinima: String(producto.existenciaMinima ?? "0"),
      existencia: String(producto.existencia ?? "0"),
    });
    setFieldErrors({});
    setFormError("");
  }

  function cerrarModal(forzar = false) {
    if (guardando && !forzar) return;
    setModal(null);
    setEditando(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError("");
  }

  function onChange(e) {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
    setFormError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError("");
    const locals = validarFormulario(form, modal);
    if (Object.keys(locals).length > 0) {
      setFieldErrors(locals);
      return;
    }

    setGuardando(true);
    try {
      if (modal === "crear") {
        await createProducto({
          codigo: form.codigo.trim(),
          nombre: form.nombre.trim(),
          idCategoria: Number(form.idCategoria),
          precioVenta: Number(form.precioVenta),
          existenciaMinima: Number(form.existenciaMinima),
        });
      } else {
        await updateProducto(editando.id, {
          precioVenta: Number(form.precioVenta),
          existenciaMinima: Number(form.existenciaMinima),
        });
      }
      setGuardando(false);
      cerrarModal(true);
      notificarAlertas();
      await cargar();
    } catch (err) {
      if (err.body?.fields) {
        setFieldErrors(err.body.fields);
      }
      setFormError(err.message || "No se pudo guardar el producto");
      setGuardando(false);
    }
  }

  return (
    <AppShell
      title="Productos"
      subtitle="Catálogo con código, categoría, precio de venta y existencia mínima."
      actions={
        esAdmin ? (
          <button
            type="button"
            className="btn btn-primary btn-inline"
            onClick={abrirCrear}
          >
            <Plus size={16} strokeWidth={2} />
            Nuevo producto
          </button>
        ) : null
      }
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
            placeholder="Buscar por código o nombre…"
            aria-label="Buscar productos por código o nombre"
          />
        </label>

        {!loading && (
          <span className="toolbar-meta">
            {productosFiltrados.length} de {productos.length}
          </span>
        )}
      </div>

      <section className="card table-card">
        {loading ? (
          <p className="status-pending">
            <Loader2 size={16} className="spin" /> Cargando productos…
          </p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nombre</th>
                  <th>Categoría</th>
                  <th>Precio venta</th>
                  <th>Existencia</th>
                  <th>Mínimo</th>
                  {esAdmin && <th>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {productosFiltrados.map((p) => (
                  <tr key={p.id}>
                    <td className="mono">{p.codigo}</td>
                    <td>
                      <strong>{p.nombre}</strong>
                    </td>
                    <td>{p.categoria || "—"}</td>
                    <td className="mono">{formatMoney(p.precioVenta)}</td>
                    <td>
                      <span
                        className={`badge ${p.stockBajo ? "badge--warning" : "badge--success"}`}
                      >
                        {Number(p.existencia)}
                      </span>
                    </td>
                    <td className="mono">{Number(p.existenciaMinima)}</td>
                    {esAdmin && (
                      <td>
                        <div className="row-actions">
                          <button
                            type="button"
                            className="btn-action btn-action--edit"
                            onClick={() => abrirEditar(p)}
                            title="Editar precio y mínimo"
                          >
                            <Pencil size={14} strokeWidth={1.75} />
                            Editar
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {productosFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={esAdmin ? 7 : 6} className="empty-cell">
                      {productos.length === 0
                        ? "No hay productos registrados."
                        : "No se encontraron productos con esa búsqueda."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modal && esAdmin && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => cerrarModal()}
        >
          <div
            className="modal modal--wide modal--fit"
            role="dialog"
            aria-modal="true"
            aria-labelledby="productos-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="productos-modal-title">
              {modal === "crear" ? "Nuevo producto" : "Editar producto"}
            </h2>
            <p className="page-subtitle">
              {modal === "crear"
                ? "Ingresa los datos del producto. La existencia inicia en 0."
                : "Puedes cambiar el precio y el mínimo. La existencia no se edita a mano."}
            </p>

            <form className="modal-form" onSubmit={handleSubmit} noValidate>
              {modal === "crear" ? (
                <>
                  <label
                    className={`field ${fieldErrors.codigo ? "field--error" : ""}`}
                  >
                    <span>
                      Código
                      <span className="field-required" aria-hidden="true">
                        *
                      </span>
                    </span>
                    <input
                      name="codigo"
                      value={form.codigo}
                      onChange={onChange}
                      placeholder="Ej. CLV-001"
                      disabled={guardando}
                      autoFocus
                      required
                      aria-required="true"
                    />
                    {fieldErrors.codigo && (
                      <em className="field-error">{fieldErrors.codigo}</em>
                    )}
                  </label>

                  <label
                    className={`field ${fieldErrors.nombre ? "field--error" : ""}`}
                  >
                    <span>
                      Nombre
                      <span className="field-required" aria-hidden="true">
                        *
                      </span>
                    </span>
                    <input
                      name="nombre"
                      value={form.nombre}
                      onChange={onChange}
                      placeholder="Ej. Clavo 2 pulgadas"
                      disabled={guardando}
                      required
                      aria-required="true"
                    />
                    {fieldErrors.nombre && (
                      <em className="field-error">{fieldErrors.nombre}</em>
                    )}
                  </label>

                  <label
                    className={`field ${fieldErrors.idCategoria ? "field--error" : ""}`}
                  >
                    <span>
                      Categoría
                      <span className="field-required" aria-hidden="true">
                        *
                      </span>
                    </span>
                    <select
                      name="idCategoria"
                      value={form.idCategoria}
                      onChange={onChange}
                      disabled={guardando || categorias.length === 0}
                      required
                      aria-required="true"
                    >
                      <option value="">Seleccione…</option>
                      {categorias.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                        </option>
                      ))}
                    </select>
                    {fieldErrors.idCategoria && (
                      <em className="field-error">{fieldErrors.idCategoria}</em>
                    )}
                    {categorias.length === 0 && (
                      <em className="field-error">
                        No hay categorías. Ejecute npm run db:seed:categorias
                      </em>
                    )}
                  </label>
                </>
              ) : (
                <>
                  <label className="field">
                    <span>Código</span>
                    <input value={form.codigo} disabled readOnly />
                  </label>
                  <label className="field">
                    <span>Nombre</span>
                    <input value={form.nombre} disabled readOnly />
                  </label>
                  <label className="field">
                    <span>Existencia actual</span>
                    <input value={form.existencia} disabled readOnly />
                  </label>
                </>
              )}

              <div className="form-grid-2">
                <label
                  className={`field ${fieldErrors.precioVenta ? "field--error" : ""}`}
                >
                  <span>
                    Precio de venta
                    <span className="field-required" aria-hidden="true">
                      *
                    </span>
                  </span>
                  <input
                    type="number"
                    name="precioVenta"
                    value={form.precioVenta}
                    onChange={onChange}
                    placeholder="Ej. 15.50"
                    min="0.01"
                    step="0.01"
                    disabled={guardando}
                    autoFocus={modal === "editar"}
                    required
                    aria-required="true"
                  />
                  {fieldErrors.precioVenta && (
                    <em className="field-error">{fieldErrors.precioVenta}</em>
                  )}
                </label>

                <label
                  className={`field ${fieldErrors.existenciaMinima ? "field--error" : ""}`}
                >
                  <span>
                    Existencia mínima
                    <span className="field-required" aria-hidden="true">
                      *
                    </span>
                  </span>
                  <input
                    type="number"
                    name="existenciaMinima"
                    value={form.existenciaMinima}
                    onChange={onChange}
                    placeholder="Ej. 10"
                    min="0"
                    step="1"
                    disabled={guardando}
                    required
                    aria-required="true"
                  />
                  {fieldErrors.existenciaMinima && (
                    <em className="field-error">
                      {fieldErrors.existenciaMinima}
                    </em>
                  )}
                </label>
              </div>

              {modal === "crear" && (
                <label className="field">
                  <span>Existencia inicial</span>
                  <input value="0" disabled readOnly />
                </label>
              )}

              {formError && (
                <p className="form-error" role="alert">
                  {formError}
                </p>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => cerrarModal()}
                  disabled={guardando}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-inline"
                  disabled={guardando}
                >
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
          </div>
        </div>
      )}
    </AppShell>
  );
}
