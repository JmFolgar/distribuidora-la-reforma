const API_URL = import.meta.env.VITE_API_URL || "/api";
const TOKEN_KEY = "nova_token";

export function getToken() {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  sessionStorage.removeItem(TOKEN_KEY);
}

async function parseBody(res) {
  return res.json().catch(() => ({}));
}

export async function apiRequest(path, options = {}) {
  const headers = { ...options.headers };
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const token = getToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
    });
  } catch {
    const err = new Error(
      "No se pudo conectar con el servidor. Verifique su conexión e intente de nuevo."
    );
    err.status = 0;
    throw err;
  }

  const body = await parseBody(res);

  if (!res.ok) {
    const err = new Error(body.message || `Error ${res.status}`);
    err.status = res.status;
    err.code = body.code;
    err.body = body;
    throw err;
  }

  return body;
}

export function getHealth() {
  return apiRequest("/health");
}

export function login(correo, contrasena) {
  return apiRequest("/auth/login", {
    method: "POST",
    body: JSON.stringify({ correo, contrasena }),
  });
}

export function logout() {
  return apiRequest("/auth/logout", { method: "POST" });
}

export function getMe() {
  return apiRequest("/auth/me");
}

export function listUsuarios() {
  return apiRequest("/usuarios");
}

export function listRoles() {
  return apiRequest("/usuarios/roles");
}

export function createUsuario(payload) {
  return apiRequest("/usuarios", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateUsuario(id, payload) {
  return apiRequest(`/usuarios/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function desactivarUsuario(id) {
  return apiRequest(`/usuarios/${id}/desactivar`, { method: "PATCH" });
}

export function activarUsuario(id) {
  return apiRequest(`/usuarios/${id}/activar`, { method: "PATCH" });
}

export function listClientes() {
  return apiRequest("/clientes");
}

export function createCliente(payload) {
  return apiRequest("/clientes", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateCliente(id, payload) {
  return apiRequest(`/clientes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function listDepartamentos() {
  return apiRequest("/ubicaciones/departamentos");
}

export function listMunicipios(departamentoId) {
  return apiRequest(
    `/ubicaciones/municipios?departamentoId=${encodeURIComponent(departamentoId)}`
  );
}

export function listProductos() {
  return apiRequest("/productos");
}

export function listCategorias() {
  return apiRequest("/productos/categorias");
}

function productoFormData(payload, imagen) {
  const data = new FormData();
  for (const [clave, valor] of Object.entries(payload)) {
    if (valor != null) data.append(clave, String(valor));
  }
  if (imagen) data.append("imagen", imagen);
  return data;
}

export function createProducto(payload, imagen) {
  return apiRequest("/productos", {
    method: "POST",
    body: productoFormData(payload, imagen),
  });
}

export function updateProducto(id, payload, imagen) {
  return apiRequest(`/productos/${id}`, {
    method: "PATCH",
    body: productoFormData(payload, imagen),
  });
}

export function eliminarProducto(id) {
  return apiRequest(`/productos/${id}`, { method: "DELETE" });
}

export function activarProducto(id) {
  return apiRequest(`/productos/${id}/activar`, { method: "PATCH" });
}

export function listProveedores() {
  return apiRequest("/proveedores");
}

export function listProveedoresActivos() {
  return apiRequest("/proveedores/activos");
}

export function createProveedor(payload) {
  return apiRequest("/proveedores", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function desactivarProveedor(id) {
  return apiRequest(`/proveedores/${id}/desactivar`, { method: "PATCH" });
}

export function activarProveedor(id) {
  return apiRequest(`/proveedores/${id}/activar`, { method: "PATCH" });
}

export function listProductosActivos() {
  return apiRequest("/productos/activos");
}

export function listCompras() {
  return apiRequest("/compras");
}

export function getCompra(id) {
  return apiRequest(`/compras/${id}`);
}

export function createCompra(payload) {
  return apiRequest("/compras", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateCompra(id, payload) {
  return apiRequest(`/compras/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function recibirCompra(id) {
  return apiRequest(`/compras/${id}/recibir`, { method: "POST" });
}

export function listAlertasInventario() {
  return apiRequest("/inventario/alertas");
}

export function crearAjusteInventario(payload) {
  return apiRequest("/inventario/ajustes", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function notificarAlertas() {
  window.dispatchEvent(new Event("inventario-alertas"));
}

export function listPedidos() {
  return apiRequest("/pedidos");
}

export function getPedido(id) {
  return apiRequest(`/pedidos/${id}`);
}

export function createPedido(payload) {
  return apiRequest("/pedidos", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updatePedido(id, payload) {
  return apiRequest(`/pedidos/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function aprobarPedido(id) {
  return apiRequest(`/pedidos/${id}/aprobar`, { method: "POST" });
}

export function rechazarPedido(id, motivo) {
  return apiRequest(`/pedidos/${id}/rechazar`, {
    method: "POST",
    body: JSON.stringify({ motivo }),
  });
}

export function listVentas() {
  return apiRequest("/ventas");
}

export function getVenta(id) {
  return apiRequest(`/ventas/${id}`);
}

export function createVenta(payload) {
  return apiRequest("/ventas", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listPagos() {
  return apiRequest("/pagos");
}

export function listMetodosPago() {
  return apiRequest("/pagos/metodos");
}

export function createPago(payload) {
  return apiRequest("/pagos", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function listAuditoria(filtros = {}) {
  const params = new URLSearchParams();
  if (filtros.usuario) params.set("usuario", String(filtros.usuario));
  if (filtros.modulo) params.set("modulo", filtros.modulo);
  if (filtros.desde) params.set("desde", filtros.desde);
  if (filtros.hasta) params.set("hasta", filtros.hasta);
  const qs = params.toString();
  return apiRequest(`/auditoria${qs ? `?${qs}` : ""}`);
}

export function listMovimientosInventario(filtros = {}) {
  const params = new URLSearchParams();
  if (filtros.idProducto) params.set("idProducto", String(filtros.idProducto));
  if (filtros.tipo) params.set("tipo", filtros.tipo);
  if (filtros.fechaDesde) params.set("fechaDesde", filtros.fechaDesde);
  if (filtros.fechaHasta) params.set("fechaHasta", filtros.fechaHasta);
  const qs = params.toString();
  return apiRequest(`/inventario/movimientos${qs ? `?${qs}` : ""}`);
}
