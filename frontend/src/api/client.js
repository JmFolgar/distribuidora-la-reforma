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
  const headers = {
    "Content-Type": "application/json",
    ...options.headers,
  };

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

export function createProducto(payload) {
  return apiRequest("/productos", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateProducto(id, payload) {
  return apiRequest(`/productos/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
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
