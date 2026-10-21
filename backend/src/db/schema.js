import {
  pgTable,
  bigint,
  varchar,
  char,
  integer,
  numeric,
  timestamp,
  date,
  boolean,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Esquema alineado al script SQL oficial (tablas FER_*).
 * Se mapean las tablas usadas por las HU implementadas.
 */

export const ferDepartamento = pgTable("FER_DEPARTAMENTO", {
  id: bigint("DEP_ID_DEPARTAMENTO", { mode: "number" })
    .generatedByDefaultAsIdentity()
    .primaryKey(),
  codigo: varchar("DEP_CODIGO", { length: 10 }).notNull(),
  nombre: varchar("DEP_NOMBRE", { length: 100 }).notNull(),
});

export const ferMunicipio = pgTable("FER_MUNICIPIO", {
  id: bigint("MUN_ID_MUNICIPIO", { mode: "number" })
    .generatedByDefaultAsIdentity()
    .primaryKey(),
  idDepartamento: bigint("MUN_ID_DEPARTAMENTO", { mode: "number" }).notNull(),
  codigo: varchar("MUN_CODIGO", { length: 10 }).notNull(),
  nombre: varchar("MUN_NOMBRE", { length: 100 }).notNull(),
});

export const ferDireccion = pgTable("FER_DIRECCION", {
  id: bigint("DIR_ID_DIRECCION", { mode: "number" })
    .generatedByDefaultAsIdentity()
    .primaryKey(),
  idMunicipio: bigint("DIR_ID_MUNICIPIO", { mode: "number" }).notNull(),
  zona: varchar("DIR_ZONA", { length: 10 }),
  colonia: varchar("DIR_COLONIA", { length: 120 }),
  calle: varchar("DIR_CALLE", { length: 120 }),
  avenida: varchar("DIR_AVENIDA", { length: 120 }),
  numeroCasa: varchar("DIR_NUMERO_CASA", { length: 30 }),
  referencia: varchar("DIR_REFERENCIA", { length: 300 }),
});

export const ferUsuario = pgTable("FER_USUARIO", {
  id: bigint("USU_ID_USUARIO", { mode: "number" })
    .generatedByDefaultAsIdentity()
    .primaryKey(),
  idDireccion: bigint("USU_ID_DIRECCION", { mode: "number" }),
  primerNombre: varchar("USU_PRIMER_NOMBRE", { length: 60 }).notNull(),
  segundoNombre: varchar("USU_SEGUNDO_NOMBRE", { length: 60 }),
  tercerNombre: varchar("USU_TERCER_NOMBRE", { length: 60 }),
  primerApellido: varchar("USU_PRIMER_APELLIDO", { length: 60 }).notNull(),
  segundoApellido: varchar("USU_SEGUNDO_APELLIDO", { length: 60 }),
  nombreUsuario: varchar("USU_NOMBRE_USUARIO", { length: 60 }).notNull(),
  correo: varchar("USU_CORREO", { length: 254 }).notNull(),
  telefono: varchar("USU_TELEFONO", { length: 30 }),
  claveHash: varchar("USU_CLAVE_HASH", { length: 255 }).notNull(),
  estado: char("USU_ESTADO", { length: 1 }).notNull().default("A"),
  intentosFallidos: integer("USU_INTENTOS_FALLIDOS").notNull().default(0),
  fechaBloqueo: timestamp("USU_FECHA_BLOQUEO", { withTimezone: true }),
  ultimoAcceso: timestamp("USU_ULTIMO_ACCESO", { withTimezone: true }),
  fechaCreacion: timestamp("USU_FECHA_CREACION", { withTimezone: true })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  fechaModificacion: timestamp("USU_FECHA_MODIFICACION", { withTimezone: true })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const ferRol = pgTable("FER_ROL", {
  id: bigint("ROL_ID_ROL", { mode: "number" })
    .generatedByDefaultAsIdentity()
    .primaryKey(),
  nombre: varchar("ROL_NOMBRE", { length: 60 }).notNull(),
  descripcion: varchar("ROL_DESCRIPCION", { length: 250 }).notNull(),
  estado: char("ROL_ESTADO", { length: 1 }).notNull().default("A"),
});

export const ferUsuarioRol = pgTable("FER_USUARIO_ROL", {
  id: bigint("URO_ID_USUARIO_ROL", { mode: "number" })
    .generatedByDefaultAsIdentity()
    .primaryKey(),
  idUsuario: bigint("URO_ID_USUARIO", { mode: "number" }).notNull(),
  idRol: bigint("URO_ID_ROL", { mode: "number" }).notNull(),
  fechaAsignacion: timestamp("URO_FECHA_ASIGNACION", { withTimezone: true })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  fechaRevocacion: timestamp("URO_FECHA_REVOCACION", { withTimezone: true }),
  estado: char("URO_ESTADO", { length: 1 }).notNull().default("A"),
});

export const ferCliente = pgTable("FER_CLIENTE", {
  id: bigint("CLI_ID_CLIENTE", { mode: "number" })
    .generatedByDefaultAsIdentity()
    .primaryKey(),
  idDireccion: bigint("CLI_ID_DIRECCION", { mode: "number" }),
  tipoPersona: varchar("CLI_TIPO_PERSONA", { length: 10 }).notNull(),
  nit: varchar("CLI_NIT", { length: 20 }),
  primerNombre: varchar("CLI_PRIMER_NOMBRE", { length: 60 }),
  segundoNombre: varchar("CLI_SEGUNDO_NOMBRE", { length: 60 }),
  tercerNombre: varchar("CLI_TERCER_NOMBRE", { length: 60 }),
  primerApellido: varchar("CLI_PRIMER_APELLIDO", { length: 60 }),
  segundoApellido: varchar("CLI_SEGUNDO_APELLIDO", { length: 60 }),
  razonSocial: varchar("CLI_RAZON_SOCIAL", { length: 180 }),
  correo: varchar("CLI_CORREO", { length: 254 }),
  telefono: varchar("CLI_TELEFONO", { length: 30 }),
  estado: char("CLI_ESTADO", { length: 1 }).notNull().default("A"),
  fechaCreacion: timestamp("CLI_FECHA_CREACION", { withTimezone: true })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const ferCategoria = pgTable("FER_CATEGORIA", {
  id: bigint("CAT_ID_CATEGORIA", { mode: "number" })
    .generatedByDefaultAsIdentity()
    .primaryKey(),
  nombre: varchar("CAT_NOMBRE", { length: 100 }).notNull(),
  descripcion: varchar("CAT_DESCRIPCION", { length: 250 }),
  estado: char("CAT_ESTADO", { length: 1 }).notNull().default("A"),
});

export const ferUnidadMedida = pgTable("FER_UNIDAD_MEDIDA", {
  id: bigint("UME_ID_UNIDAD_MEDIDA", { mode: "number" })
    .generatedByDefaultAsIdentity()
    .primaryKey(),
  codigo: varchar("UME_CODIGO", { length: 20 }).notNull(),
  nombre: varchar("UME_NOMBRE", { length: 80 }).notNull(),
  abreviatura: varchar("UME_ABREVIATURA", { length: 15 }).notNull(),
  estado: char("UME_ESTADO", { length: 1 }).notNull().default("A"),
});

export const ferProducto = pgTable("FER_PRODUCTO", {
  id: bigint("PRO_ID_PRODUCTO", { mode: "number" })
    .generatedByDefaultAsIdentity()
    .primaryKey(),
  idCategoria: bigint("PRO_ID_CATEGORIA", { mode: "number" }).notNull(),
  idUnidadMedida: bigint("PRO_ID_UNIDAD_MEDIDA", { mode: "number" }).notNull(),
  codigo: varchar("PRO_CODIGO", { length: 50 }).notNull(),
  nombre: varchar("PRO_NOMBRE", { length: 150 }).notNull(),
  descripcion: varchar("PRO_DESCRIPCION", { length: 500 }),
  imagen: varchar("PRO_IMAGEN", { length: 300 }),
  precioCompra: numeric("PRO_PRECIO_COMPRA", { precision: 14, scale: 2 })
    .notNull()
    .default("0"),
  precioVenta: numeric("PRO_PRECIO_VENTA", { precision: 14, scale: 2 }).notNull(),
  porcentajeImpuesto: numeric("PRO_PORCENTAJE_IMPUESTO", {
    precision: 5,
    scale: 2,
  })
    .notNull()
    .default("0"),
  existenciaMinima: numeric("PRO_EXISTENCIA_MINIMA", {
    precision: 14,
    scale: 3,
  })
    .notNull()
    .default("0"),
  estado: char("PRO_ESTADO", { length: 1 }).notNull().default("A"),
  fechaCreacion: timestamp("PRO_FECHA_CREACION", { withTimezone: true })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  fechaModificacion: timestamp("PRO_FECHA_MODIFICACION", {
    withTimezone: true,
  })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const ferProveedor = pgTable("FER_PROVEEDOR", {
  id: bigint("PRV_ID_PROVEEDOR", { mode: "number" })
    .generatedByDefaultAsIdentity()
    .primaryKey(),
  idDireccion: bigint("PRV_ID_DIRECCION", { mode: "number" }).notNull(),
  nit: varchar("PRV_NIT", { length: 20 }).notNull(),
  razonSocial: varchar("PRV_RAZON_SOCIAL", { length: 180 }).notNull(),
  nombreContacto: varchar("PRV_NOMBRE_CONTACTO", { length: 180 }),
  correo: varchar("PRV_CORREO", { length: 254 }).notNull(),
  telefono: varchar("PRV_TELEFONO", { length: 30 }).notNull(),
  estado: char("PRV_ESTADO", { length: 1 }).notNull().default("A"),
  fechaCreacion: timestamp("PRV_FECHA_CREACION", { withTimezone: true })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
});

export const ferCompra = pgTable("FER_COMPRA", {
  id: bigint("COM_ID_COMPRA", { mode: "number" })
    .generatedByDefaultAsIdentity()
    .primaryKey(),
  idProveedor: bigint("COM_ID_PROVEEDOR", { mode: "number" }).notNull(),
  numeroCompra: varchar("COM_NUMERO_COMPRA", { length: 40 }).notNull(),
  fechaCompra: timestamp("COM_FECHA_COMPRA", { withTimezone: true })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  fechaEsperada: date("COM_FECHA_ESPERADA"),
  estado: varchar("COM_ESTADO", { length: 20 }).notNull().default("CREADA"),
  observacion: varchar("COM_OBSERVACION", { length: 500 }),
});

export const ferDetalleCompra = pgTable("FER_DETALLE_COMPRA", {
  id: bigint("DCO_ID_DETALLE_COMPRA", { mode: "number" })
    .generatedByDefaultAsIdentity()
    .primaryKey(),
  idCompra: bigint("DCO_ID_COMPRA", { mode: "number" }).notNull(),
  idProducto: bigint("DCO_ID_PRODUCTO", { mode: "number" }).notNull(),
  cantidad: numeric("DCO_CANTIDAD", { precision: 14, scale: 3 }).notNull(),
  costoUnitario: numeric("DCO_COSTO_UNITARIO", {
    precision: 14,
    scale: 2,
  }).notNull(),
  porcentajeDescuento: numeric("DCO_PORCENTAJE_DESCUENTO", {
    precision: 5,
    scale: 2,
  })
    .notNull()
    .default("0"),
  porcentajeImpuesto: numeric("DCO_PORCENTAJE_IMPUESTO", {
    precision: 5,
    scale: 2,
  })
    .notNull()
    .default("0"),
});

export const ferRecepcion = pgTable("FER_RECEPCION", {
  id: bigint("REC_ID_RECEPCION", { mode: "number" })
    .generatedByDefaultAsIdentity()
    .primaryKey(),
  idCompra: bigint("REC_ID_COMPRA", { mode: "number" }).notNull(),
  numeroRecepcion: varchar("REC_NUMERO_RECEPCION", { length: 40 }).notNull(),
  fechaRecepcion: timestamp("REC_FECHA_RECEPCION", { withTimezone: true })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  estado: varchar("REC_ESTADO", { length: 20 }).notNull().default("BORRADOR"),
  observacion: varchar("REC_OBSERVACION", { length: 500 }),
});

export const ferDetalleRecepcion = pgTable("FER_DETALLE_RECEPCION", {
  id: bigint("DRE_ID_DETALLE_RECEPCION", { mode: "number" })
    .generatedByDefaultAsIdentity()
    .primaryKey(),
  idRecepcion: bigint("DRE_ID_RECEPCION", { mode: "number" }).notNull(),
  idDetalleCompra: bigint("DRE_ID_DETALLE_COMPRA", { mode: "number" }).notNull(),
  cantidadRecibida: numeric("DRE_CANTIDAD_RECIBIDA", {
    precision: 14,
    scale: 3,
  })
    .notNull()
    .default("0"),
  cantidadRechazada: numeric("DRE_CANTIDAD_RECHAZADA", {
    precision: 14,
    scale: 3,
  })
    .notNull()
    .default("0"),
  motivoRechazo: varchar("DRE_MOTIVO_RECHAZO", { length: 300 }),
});

export const ferMovimientoInventario = pgTable("FER_MOVIMIENTO_INVENTARIO", {
  id: bigint("MOV_ID_MOVIMIENTO", { mode: "number" })
    .generatedByDefaultAsIdentity()
    .primaryKey(),
  idInventario: bigint("MOV_ID_INVENTARIO", { mode: "number" }).notNull(),
  idUsuario: bigint("MOV_ID_USUARIO", { mode: "number" }).notNull(),
  tipoMovimiento: varchar("MOV_TIPO_MOVIMIENTO", { length: 15 }).notNull(),
  cantidad: numeric("MOV_CANTIDAD", { precision: 14, scale: 3 }).notNull(),
  existenciaAnterior: numeric("MOV_EXISTENCIA_ANTERIOR", {
    precision: 14,
    scale: 3,
  }).notNull(),
  existenciaNueva: numeric("MOV_EXISTENCIA_NUEVA", {
    precision: 14,
    scale: 3,
  }).notNull(),
  fechaMovimiento: timestamp("MOV_FECHA_MOVIMIENTO", { withTimezone: true })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  moduloOrigen: varchar("MOV_MODULO_ORIGEN", { length: 40 }).notNull(),
  idRegistroOrigen: bigint("MOV_ID_REGISTRO_ORIGEN", { mode: "number" }).notNull(),
  numeroDocumento: varchar("MOV_NUMERO_DOCUMENTO", { length: 40 }),
  motivo: varchar("MOV_MOTIVO", { length: 300 }),
});

export const ferInventario = pgTable("FER_INVENTARIO", {
  id: bigint("INV_ID_INVENTARIO", { mode: "number" })
    .generatedByDefaultAsIdentity()
    .primaryKey(),
  idProducto: bigint("INV_ID_PRODUCTO", { mode: "number" }).notNull(),
  existenciaActual: numeric("INV_EXISTENCIA_ACTUAL", {
    precision: 14,
    scale: 3,
  })
    .notNull()
    .default("0"),
  cantidadReservada: numeric("INV_CANTIDAD_RESERVADA", {
    precision: 14,
    scale: 3,
  })
    .notNull()
    .default("0"),
  fechaUltimoMovimiento: timestamp("INV_FECHA_ULTIMO_MOVIMIENTO", {
    withTimezone: true,
  }),
  version: integer("INV_VERSION").notNull().default(0),
});

export const ferEstadoPedido = pgTable("FER_ESTADO_PEDIDO", {
  id: bigint("EPE_ID_ESTADO_PEDIDO", { mode: "number" })
    .generatedByDefaultAsIdentity()
    .primaryKey(),
  codigo: varchar("EPE_CODIGO", { length: 30 }).notNull(),
  nombre: varchar("EPE_NOMBRE", { length: 80 }).notNull(),
  orden: integer("EPE_ORDEN").notNull(),
  permiteModificar: boolean("EPE_PERMITE_MODIFICAR").notNull().default(false),
  permiteFacturar: boolean("EPE_PERMITE_FACTURAR").notNull().default(false),
  estado: char("EPE_ESTADO", { length: 1 }).notNull().default("A"),
});

export const ferPedido = pgTable("FER_PEDIDO", {
  id: bigint("PED_ID_PEDIDO", { mode: "number" })
    .generatedByDefaultAsIdentity()
    .primaryKey(),
  idCliente: bigint("PED_ID_CLIENTE", { mode: "number" }).notNull(),
  idEstadoPedido: bigint("PED_ID_ESTADO_PEDIDO", { mode: "number" }).notNull(),
  idDescuento: bigint("PED_ID_DESCUENTO", { mode: "number" }),
  numeroPedido: varchar("PED_NUMERO_PEDIDO", { length: 40 }).notNull(),
  fechaPedido: timestamp("PED_FECHA_PEDIDO", { withTimezone: true })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  fechaRequerida: date("PED_FECHA_REQUERIDA"),
  porcentajeDescuento: numeric("PED_PORCENTAJE_DESCUENTO", {
    precision: 5,
    scale: 2,
  })
    .notNull()
    .default("0"),
  observacion: varchar("PED_OBSERVACION", { length: 500 }),
});

export const ferDetallePedido = pgTable("FER_DETALLE_PEDIDO", {
  id: bigint("DPE_ID_DETALLE_PEDIDO", { mode: "number" })
    .generatedByDefaultAsIdentity()
    .primaryKey(),
  idPedido: bigint("DPE_ID_PEDIDO", { mode: "number" }).notNull(),
  idProducto: bigint("DPE_ID_PRODUCTO", { mode: "number" }).notNull(),
  cantidad: numeric("DPE_CANTIDAD", { precision: 14, scale: 3 }).notNull(),
  precioUnitario: numeric("DPE_PRECIO_UNITARIO", {
    precision: 14,
    scale: 2,
  }).notNull(),
  porcentajeDescuento: numeric("DPE_PORCENTAJE_DESCUENTO", {
    precision: 5,
    scale: 2,
  })
    .notNull()
    .default("0"),
  porcentajeImpuesto: numeric("DPE_PORCENTAJE_IMPUESTO", {
    precision: 5,
    scale: 2,
  })
    .notNull()
    .default("0"),
});

export const ferHistorialPedido = pgTable("FER_HISTORIAL_PEDIDO", {
  id: bigint("HPE_ID_HISTORIAL_PEDIDO", { mode: "number" })
    .generatedByDefaultAsIdentity()
    .primaryKey(),
  idPedido: bigint("HPE_ID_PEDIDO", { mode: "number" }).notNull(),
  idEstadoAnterior: bigint("HPE_ID_ESTADO_ANTERIOR", { mode: "number" }),
  idEstadoNuevo: bigint("HPE_ID_ESTADO_NUEVO", { mode: "number" }).notNull(),
  idUsuario: bigint("HPE_ID_USUARIO", { mode: "number" }).notNull(),
  fechaCambio: timestamp("HPE_FECHA_CAMBIO", { withTimezone: true })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  observacion: varchar("HPE_OBSERVACION", { length: 500 }),
});

export const ferAprobacion = pgTable("FER_APROBACION", {
  id: bigint("APR_ID_APROBACION", { mode: "number" })
    .generatedByDefaultAsIdentity()
    .primaryKey(),
  idPedido: bigint("APR_ID_PEDIDO", { mode: "number" }).notNull(),
  idUsuarioSolicita: bigint("APR_ID_USUARIO_SOLICITA", { mode: "number" }).notNull(),
  idUsuarioAutoriza: bigint("APR_ID_USUARIO_AUTORIZA", { mode: "number" }),
  tipoAprobacion: varchar("APR_TIPO_APROBACION", { length: 30 }).notNull(),
  valorSolicitado: numeric("APR_VALOR_SOLICITADO", {
    precision: 14,
    scale: 2,
  }).notNull(),
  valorPermitido: numeric("APR_VALOR_PERMITIDO", {
    precision: 14,
    scale: 2,
  }).notNull(),
  estado: varchar("APR_ESTADO", { length: 15 }).notNull().default("PENDIENTE"),
  fechaSolicitud: timestamp("APR_FECHA_SOLICITUD", { withTimezone: true })
    .notNull()
    .default(sql`CURRENT_TIMESTAMP`),
  fechaRespuesta: timestamp("APR_FECHA_RESPUESTA", { withTimezone: true }),
  observacion: varchar("APR_OBSERVACION", { length: 500 }),
});
