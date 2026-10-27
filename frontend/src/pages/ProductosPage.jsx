import { useCallback, useEffect, useMemo, useState } from "react";
import { ImageOff, Loader2, Pencil, Plus, Trash2, UserCheck, X, ZoomIn } from "lucide-react";
import AppShell from "../layout/AppShell";
import { useAuth } from "../auth/AuthContext";
import {
  activarProducto,
  createProducto,
  eliminarProducto,
  listCategorias,
  listProductos,
  notificarAlertas,
  updateProducto,
} from "../api/client";
import { enteroValido, montoValido } from "../utils/validacion";

const FILTROS_PRODUCTO = {
  nombre: "",
  codigo: "",
  idCategoria: "",
  conExistencia: false,
};

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

const MAX_IMAGEN = 2 * 1024 * 1024;

function validarImagen(archivo) {
  if (!archivo) return "";
  const tipoOk =
    archivo.type === "image/jpeg" || archivo.type === "image/png";
  if (!tipoOk) return "La imagen debe ser JPG o PNG";
  if (archivo.size > MAX_IMAGEN) return "La imagen no puede superar 2 MB";
  return "";
}

function validarFormulario(form, modo, imagen) {
  const fields = {};
  if (modo === "crear") {
    if (!form.codigo.trim()) fields.codigo = "El código es obligatorio";
    if (!form.nombre.trim()) fields.nombre = "El nombre es obligatorio";
    if (!form.idCategoria) fields.idCategoria = "Seleccione una categoría";
  }

  if (form.precioVenta === "" || form.precioVenta == null) {
    fields.precioVenta = "El precio de venta es obligatorio";
  } else if (!montoValido(form.precioVenta)) {
    fields.precioVenta =
      "El precio debe ser mayor a 0 y tener como máximo 2 decimales";
  }

  if (form.existenciaMinima === "" || form.existenciaMinima == null) {
    fields.existenciaMinima = "La existencia mínima es obligatoria";
  } else if (!enteroValido(form.existenciaMinima) || Number(form.existenciaMinima) < 0) {
    fields.existenciaMinima = "Debe ser un número entero igual o mayor a 0";
  }

  const errorImagen = validarImagen(imagen);
  if (errorImagen) fields.imagen = errorImagen;

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
  const [filtros, setFiltros] = useState(FILTROS_PRODUCTO);
  const [confirmacion, setConfirmacion] = useState(null);
  const [resultado, setResultado] = useState(null);
  const [imagen, setImagen] = useState(null);
  const [vistaPrevia, setVistaPrevia] = useState("");
  const [imagenAmpliada, setImagenAmpliada] = useState(null);

  const productosFiltrados = useMemo(() => {
    const nombre = filtros.nombre.trim().toLowerCase();
    const codigo = filtros.codigo.trim().toLowerCase();
    return productos.filter((producto) => {
      if (nombre && !(producto.nombre || "").toLowerCase().includes(nombre)) return false;
      if (codigo && !(producto.codigo || "").toLowerCase().includes(codigo)) return false;
      if (filtros.idCategoria && String(producto.idCategoria) !== filtros.idCategoria) return false;
      if (filtros.conExistencia && Number(producto.existencia) <= 0) return false;
      return true;
    });
  }, [productos, filtros]);

  const hayFiltrosProducto = Boolean(
    filtros.nombre.trim() || filtros.codigo.trim() || filtros.idCategoria || filtros.conExistencia
  );

  function limpiarFiltrosProducto() {
    setFiltros(FILTROS_PRODUCTO);
  }

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

  useEffect(() => {
    if (!imagenAmpliada) return undefined;
    function onKey(e) {
      if (e.key === "Escape") setImagenAmpliada(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [imagenAmpliada]);

  function abrirCrear() {
    setModal("crear");
    setEditando(null);
    setForm({
      ...EMPTY_FORM,
      idCategoria: categorias[0]?.id ? String(categorias[0].id) : "",
    });
    setFieldErrors({});
    setFormError("");
    setImagen(null);
    setVistaPrevia("");
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
    setImagen(null);
    setVistaPrevia("");
  }

  function cerrarModal(forzar = false) {
    if (guardando && !forzar) return;
    setModal(null);
    setEditando(null);
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setFormError("");
    setImagen(null);
    setVistaPrevia("");
  }

  function onImagen(e) {
    const archivo = e.target.files?.[0] || null;
    setImagen(archivo);
    setVistaPrevia(archivo ? URL.createObjectURL(archivo) : "");
    setFieldErrors((prev) => {
      if (!prev.imagen) return prev;
      const next = { ...prev };
      delete next.imagen;
      return next;
    });
    setFormError("");
  }

  async function confirmarAccion() {
    if (!confirmacion) return;
    setGuardando(true);
    setFormError("");
    try {
      let siguiente;
      if (confirmacion.tipo === "eliminar") {
        const res = await eliminarProducto(confirmacion.producto.id);
        const nombre = confirmacion.producto.nombre;
        siguiente =
          res.action === "DESACTIVADO"
            ? {
                titulo: "Producto desactivado",
                mensaje: (
                  <>
                    No se borró <strong>{nombre}</strong> porque tiene
                    movimientos. Pasó a inactivo para conservar su historial y
                    ya no aparece en compras ni pedidos.
                  </>
                ),
              }
            : {
                titulo: "Producto eliminado",
                mensaje: (
                  <>
                    <strong>{nombre}</strong> se eliminó de la lista porque
                    nunca tuvo movimientos.
                  </>
                ),
              };
      } else {
        const nombre = confirmacion.producto.nombre;
        await activarProducto(confirmacion.producto.id);
        siguiente = {
          titulo: "Producto reactivado",
          mensaje: (
            <>
              <strong>{nombre}</strong> volvió a estar disponible para elegir
              en las compras.
            </>
          ),
        };
      }
      setGuardando(false);
      setConfirmacion(null);
      await new Promise((resolve) => setTimeout(resolve, 200));
      setResultado(siguiente);
      notificarAlertas();
      await cargar();
    } catch (err) {
      setFormError(err.message || "No se pudo completar la acción");
      setGuardando(false);
    }
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
    const locals = validarFormulario(form, modal, imagen);
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
        }, imagen);
      } else {
        await updateProducto(editando.id, {
          precioVenta: Number(form.precioVenta),
          existenciaMinima: Number(form.existenciaMinima),
        }, imagen);
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

      <form className="mov-filtros" onSubmit={(e) => e.preventDefault()}>
        <label className="mov-filtros__control">
          <span>Nombre</span>
          <input
            type="search"
            value={filtros.nombre}
            placeholder="Parte del nombre"
            onChange={(e) => setFiltros((actual) => ({ ...actual, nombre: e.target.value }))}
          />
        </label>
        <label className="mov-filtros__control">
          <span>Código</span>
          <input
            type="search"
            value={filtros.codigo}
            placeholder="Parte del código"
            onChange={(e) => setFiltros((actual) => ({ ...actual, codigo: e.target.value }))}
          />
        </label>
        <label className="mov-filtros__control">
          <span>Categoría</span>
          <select
            value={filtros.idCategoria}
            onChange={(e) => setFiltros((actual) => ({ ...actual, idCategoria: e.target.value }))}
          >
            <option value="">Todas</option>
            {categorias.map((categoria) => (
              <option key={categoria.id} value={categoria.id}>
                {categoria.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="mov-filtros__check">
          <input
            type="checkbox"
            checked={filtros.conExistencia}
            onChange={(e) =>
              setFiltros((actual) => ({ ...actual, conExistencia: e.target.checked }))
            }
          />
          <span>Solo con existencia</span>
        </label>
        <div className="mov-filtros__actions">
          <button
            type="button"
            className="mov-filtros__reset"
            disabled={!hayFiltrosProducto}
            onClick={limpiarFiltrosProducto}
          >
            Limpiar filtros
          </button>
        </div>
      </form>

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
                  <th>Imagen</th>
                  <th>Código</th>
                  <th>Nombre</th>
                  <th>Categoría</th>
                  <th>Precio venta</th>
                  <th>Existencia</th>
                  <th>Mínimo</th>
                  <th>Estado</th>
                  {esAdmin && <th>Acciones</th>}
                </tr>
              </thead>
              <tbody>
                {productosFiltrados.map((p) => (
                  <tr key={p.id}>
                    <td>
                      {p.imagen ? (
                        <span className="producto-thumb-wrap">
                          <img
                            className="producto-thumb"
                            src={p.imagen}
                            alt=""
                          />
                          <button
                            type="button"
                            className="producto-zoom"
                            aria-label={`Ampliar imagen de ${p.nombre}`}
                            onClick={() =>
                              setImagenAmpliada({
                                src: p.imagen,
                                nombre: p.nombre,
                              })
                            }
                          >
                            <ZoomIn size={12} strokeWidth={2} />
                          </button>
                        </span>
                      ) : (
                        <span className="producto-thumb producto-thumb--empty" aria-hidden>
                          <ImageOff size={16} strokeWidth={1.75} />
                        </span>
                      )}
                    </td>
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
                    <td>
                      <span
                        className={`badge ${p.activo ? "badge--success" : "badge--danger"}`}
                      >
                        {p.activo ? "Activo" : "Inactivo"}
                      </span>
                    </td>
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
                          {p.activo ? (
                            <button
                              type="button"
                              className="btn-action btn-action--danger"
                              onClick={() => {
                                setConfirmacion({ tipo: "eliminar", producto: p });
                                setFormError("");
                              }}
                            >
                              <Trash2 size={14} strokeWidth={1.75} />
                              Eliminar
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn-action btn-action--success"
                              onClick={() => {
                                setConfirmacion({ tipo: "reactivar", producto: p });
                                setFormError("");
                              }}
                            >
                              <UserCheck size={14} strokeWidth={1.75} />
                              Reactivar
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {productosFiltrados.length === 0 && (
                  <tr>
                    <td colSpan={esAdmin ? 9 : 8} className="empty-cell">
                      {productos.length === 0 ? (
                        "No hay productos registrados."
                      ) : (
                        <div className="empty-filtros">
                          <p>No hay resultados</p>
                          <button type="button" className="btn-ghost" onClick={limpiarFiltrosProducto}>
                            Limpiar filtros
                          </button>
                        </div>
                      )}
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
                : "Puedes cambiar el precio, el mínimo y la imagen. La existencia no se edita a mano."}
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
                    type="text"
                    inputMode="numeric"
                    name="existenciaMinima"
                    value={form.existenciaMinima}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (value !== "" && !/^\d+$/.test(value)) return;
                      onChange(e);
                    }}
                    placeholder="Ej. 10"
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

              <div
                className={`field ${fieldErrors.imagen ? "field--error" : ""}`}
              >
                <span>Imagen</span>
                {(vistaPrevia || editando?.imagen) && (
                  <span className="producto-thumb-wrap producto-thumb-wrap--preview">
                    <img
                      className="producto-preview"
                      src={vistaPrevia || editando.imagen}
                      alt=""
                    />
                    <button
                      type="button"
                      className="producto-zoom"
                      aria-label="Ampliar imagen"
                      onClick={() =>
                        setImagenAmpliada({
                          src: vistaPrevia || editando.imagen,
                          nombre: form.nombre || editando?.nombre || "Producto",
                        })
                      }
                    >
                      <ZoomIn size={12} strokeWidth={2} />
                    </button>
                  </span>
                )}
                <div className="file-picker">
                  <input
                    id="producto-imagen"
                    className="file-picker__input"
                    type="file"
                    accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                    onChange={onImagen}
                    disabled={guardando}
                  />
                  <label
                    htmlFor="producto-imagen"
                    className="file-picker__btn"
                  >
                    Seleccionar archivo
                  </label>
                  <span className="file-picker__name">
                    {imagen?.name || "Ningún archivo seleccionado"}
                  </span>
                </div>
                <em className="field-help">JPG o PNG, máximo 2 MB.</em>
                {fieldErrors.imagen && (
                  <em className="field-error">{fieldErrors.imagen}</em>
                )}
              </div>

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

      {resultado && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => setResultado(null)}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="producto-resultado-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="producto-resultado-title">{resultado.titulo}</h2>
            <p className="page-subtitle">{resultado.mensaje}</p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-primary btn-inline"
                onClick={() => setResultado(null)}
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmacion && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={() => !guardando && setConfirmacion(null)}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="producto-confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="producto-confirm-title">
              {confirmacion.tipo === "eliminar"
                ? "Eliminar producto"
                : "Reactivar producto"}
            </h2>
            <p className="page-subtitle">
              {confirmacion.tipo === "eliminar" ? (
                <>
                  ¿Eliminar <strong>{confirmacion.producto.nombre}</strong>? Si
                  nunca tuvo movimientos, se borra de la lista. Si ya tiene
                  historial, no se borra: pasa a inactivo y deja de aparecer en
                  compras y pedidos.
                </>
              ) : (
                <>
                  ¿Reactivar <strong>{confirmacion.producto.nombre}</strong>?
                  Volverá a estar disponible para elegir en las compras.
                </>
              )}
            </p>
            {formError && (
              <p className="form-error" role="alert">
                {formError}
              </p>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setConfirmacion(null)}
                disabled={guardando}
              >
                Cancelar
              </button>
              <button
                type="button"
                className={`btn btn-inline ${confirmacion.tipo === "eliminar" ? "btn-danger" : "btn-success"}`}
                onClick={confirmarAccion}
                disabled={guardando}
              >
                {guardando ? (
                  <>
                    <Loader2 size={16} className="spin" />
                    Guardando…
                  </>
                ) : confirmacion.tipo === "eliminar" ? (
                  "Eliminar"
                ) : (
                  "Reactivar"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {imagenAmpliada && (
        <div
          className="modal-backdrop imagen-ampliada-backdrop"
          role="presentation"
          onClick={() => setImagenAmpliada(null)}
        >
          <figure
            className="imagen-ampliada"
            role="dialog"
            aria-modal="true"
            aria-label={imagenAmpliada.nombre}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              className="icon-btn imagen-ampliada__cerrar"
              aria-label="Cerrar"
              onClick={() => setImagenAmpliada(null)}
            >
              <X size={18} strokeWidth={1.75} />
            </button>
            <img src={imagenAmpliada.src} alt={imagenAmpliada.nombre} />
            <figcaption>{imagenAmpliada.nombre}</figcaption>
          </figure>
        </div>
      )}
    </AppShell>
  );
}
