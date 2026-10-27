import { db } from "./db/index.js";
import { ferAuditoria } from "./db/schema.js";

export const MODULOS_AUDITORIA = [
  ["SESION", "Sesión"],
  ["USUARIOS", "Usuarios"],
  ["CLIENTES", "Clientes"],
  ["PROVEEDORES", "Proveedores"],
  ["PRODUCTOS", "Productos"],
  ["COMPRAS", "Compras"],
  ["INVENTARIO", "Inventario"],
  ["PEDIDOS", "Pedidos"],
  ["VENTAS", "Ventas"],
  ["PAGOS", "Pagos"],
  ["CONFIGURACION", "Configuración"],
];

export const ACCIONES_AUDITORIA = {
  LOGIN: "Inicio de sesión",
  CREAR: "Creación",
  MODIFICAR: "Modificación",
  DESACTIVAR: "Desactivación",
  ACTIVAR: "Activación",
  ELIMINAR: "Eliminación",
  APROBAR: "Aprobación",
  RECHAZAR: "Rechazo",
  RECEPCION: "Recepción",
  AJUSTE: "Ajuste",
  VENTA: "Venta",
  PAGO: "Pago",
  DEVOLUCION: "Devolución",
  CAMBIO_ESTADO: "Cambio de estado",
};

export function codigoCliente(id) {
  return `CLI-${String(id).padStart(3, "0")}`;
}

export function nombreModulo(codigo) {
  return MODULOS_AUDITORIA.find(([id]) => id === codigo)?.[1] || codigo;
}

export function nombreAccion(codigo) {
  return ACCIONES_AUDITORIA[codigo] || codigo;
}

export function listaAcciones() {
  return Object.entries(ACCIONES_AUDITORIA).map(([id, nombre]) => ({ id, nombre }));
}

export async function registrarAuditoria(evento, executor = db) {
  try {
    const valorNuevo = {
      ...(evento.valorNuevo && typeof evento.valorNuevo === "object"
        ? evento.valorNuevo
        : {}),
    };
    if (evento.registro) valorNuevo.registro = String(evento.registro);
    await executor.insert(ferAuditoria).values({
      idUsuario: evento.idUsuario,
      modulo: evento.modulo,
      accion: evento.accion,
      entidad: evento.entidad,
      idRegistro: evento.idRegistro,
      valorAnterior: evento.valorAnterior ?? null,
      valorNuevo: Object.keys(valorNuevo).length ? valorNuevo : null,
      resultado: evento.resultado || "EXITO",
      mensaje: evento.mensaje ? String(evento.mensaje).slice(0, 500) : null,
    });
  } catch (error) {
    console.error("No se pudo registrar la auditoría", error);
  }
}
