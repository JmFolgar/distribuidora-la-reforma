import { Router } from "express";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  ferAprobacion,
  ferAuditoria,
  ferCliente,
  ferDetallePedido,
  ferEstadoPedido,
  ferHistorialPedido,
  ferInventario,
  ferPedido,
  ferProducto,
  ferUsuario,
  ferVenta,
} from "../db/schema.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { enteroPositivo } from "../validacion.js";
import { registrarAuditoria } from "../auditoria.js";

const router = Router();

router.use(requireAuth);

const ROLES = ["ADMINISTRADOR", "SUPERVISOR", "OPERADOR"];
const ROLES_APROBACION = ["ADMINISTRADOR", "SUPERVISOR"];

/** Porcentaje de descuento que se puede aplicar sin que un supervisor lo autorice. */
export const PORCENTAJE_MAXIMO_SIN_APROBACION = 10;

const ESTADO_CREADO = "CREADO";
const ESTADO_PENDIENTE = "PENDIENTE_APROBACION";
const ESTADO_APROBADO = "APROBADO";
const ESTADO_CANCELADO = "CANCELADO";
const ESTADOS_CANCELABLES = new Set([ESTADO_CREADO, ESTADO_PENDIENTE, ESTADO_APROBADO]);
const MARCA_CANCELACION = "Cancelación: ";

const porcentajeSchema = z.preprocess(
  (v) => (v == null || v === "" ? 0 : v),
  z.coerce
    .number({ invalid_type_error: "El descuento debe ser un número" })
    .refine((v) => v >= 0 && v <= 100, {
      message: "El descuento debe estar entre 0 y 100",
    })
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, {
      message: "El descuento puede tener como máximo 2 decimales",
    })
);

const lineaSchema = z.object({
  idProducto: z.coerce
    .number({ invalid_type_error: "Seleccione un producto" })
    .int()
    .positive("Seleccione un producto"),
  cantidad: enteroPositivo("La cantidad es obligatoria"),
});

const pedidoBodySchema = z.object({
  idCliente: z.coerce
    .number({ invalid_type_error: "Seleccione un cliente" })
    .int()
    .positive("Seleccione un cliente"),
  porcentajeDescuento: porcentajeSchema,
  enviar: z.boolean().optional().default(false),
  lineas: z
    .array(lineaSchema)
    .min(1, "Debe agregar al menos un producto"),
});

function toNumber(value) {
  if (value == null || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function nombreCliente(row) {
  if (row.tipoPersona === "JURIDICA" && row.razonSocial) return row.razonSocial;
  return [row.primerNombre, row.primerApellido].filter(Boolean).join(" ");
}

function nombrePersona(row) {
  if (!row) return null;
  const nombre = [row.primerNombre, row.primerApellido].filter(Boolean).join(" ");
  return nombre || null;
}

function textoDisponibles(existencia) {
  const n = toNumber(existencia);
  const cantidad = Number.isInteger(n) ? String(n) : String(n);
  if (n === 1) return "Hay 1 unidad disponible";
  return `Hay ${cantidad} unidades disponibles`;
}

function totales(lineas, porcentaje) {
  const subtotal = roundMoney(
    lineas.reduce(
      (sum, l) => sum + toNumber(l.cantidad) * toNumber(l.precioUnitario),
      0
    )
  );
  const descuento = roundMoney(subtotal * (toNumber(porcentaje) / 100));
  return {
    subtotal,
    descuento,
    total: roundMoney(subtotal - descuento),
  };
}

function fieldErrorsFromZod(error) {
  const fields = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".");
    if (path === "lineas" && issue.code === "too_small") {
      fields.lineas = issue.message;
      continue;
    }
    if (path.startsWith("lineas.")) {
      const match = path.match(/^lineas\.(\d+)\.(\w+)$/);
      if (match) {
        const key = `lineas_${match[1]}_${match[2]}`;
        if (!fields[key]) fields[key] = issue.message;
      } else if (!fields.lineas) {
        fields.lineas = issue.message;
      }
      continue;
    }
    const key = issue.path[0];
    if (key && !fields[key]) fields[key] = issue.message;
  }
  return fields;
}

async function estadosPorCodigo(tx) {
  const rows = await tx.select().from(ferEstadoPedido);
  return Object.fromEntries(rows.map((row) => [row.codigo, row]));
}

async function generarNumeroPedido(tx) {
  const year = new Date().getFullYear();
  const prefix = `PED-${year}-`;
  const [row] = await tx
    .select({ numero: ferPedido.numeroPedido })
    .from(ferPedido)
    .where(sql`${ferPedido.numeroPedido} LIKE ${prefix + "%"}`)
    .orderBy(desc(ferPedido.numeroPedido))
    .limit(1);

  let secuencia = 1;
  if (row?.numero) {
    const parsed = Number.parseInt(row.numero.slice(prefix.length), 10);
    if (Number.isFinite(parsed)) secuencia = parsed + 1;
  }

  return `${prefix}${String(secuencia).padStart(5, "0")}`;
}

async function validarClienteActivo(tx, idCliente) {
  const [cliente] = await tx
    .select()
    .from(ferCliente)
    .where(eq(ferCliente.id, idCliente))
    .limit(1);

  if (!cliente) {
    return { ok: false, status: 404, message: "Cliente no encontrado" };
  }
  if (cliente.estado !== "A") {
    return {
      ok: false,
      status: 400,
      message: "El cliente seleccionado no está activo",
      fields: { idCliente: "Seleccione un cliente activo" },
    };
  }
  return { ok: true, cliente };
}

async function prepararLineas(tx, lineas) {
  const ids = lineas.map((l) => l.idProducto);
  if (new Set(ids).size !== ids.length) {
    return {
      ok: false,
      status: 400,
      message: "No puede repetir el mismo producto en el pedido",
      fields: { lineas: "Cada producto solo puede aparecer una vez" },
    };
  }

  const productos = await tx
    .select({
      id: ferProducto.id,
      codigo: ferProducto.codigo,
      nombre: ferProducto.nombre,
      precioVenta: ferProducto.precioVenta,
      porcentajeImpuesto: ferProducto.porcentajeImpuesto,
      estado: ferProducto.estado,
      existenciaActual: ferInventario.existenciaActual,
    })
    .from(ferProducto)
    .leftJoin(ferInventario, eq(ferInventario.idProducto, ferProducto.id))
    .where(inArray(ferProducto.id, ids));

  const porId = new Map(productos.map((p) => [p.id, p]));
  const fields = {};

  lineas.forEach((linea, index) => {
    const producto = porId.get(linea.idProducto);
    if (!producto) {
      fields[`lineas_${index}_idProducto`] = "El producto no existe";
      return;
    }
    if (producto.estado !== "A") {
      fields[`lineas_${index}_idProducto`] = "El producto no está activo";
      return;
    }
    const existencia = toNumber(producto.existenciaActual);
    if (linea.cantidad > existencia) {
      fields[`lineas_${index}_cantidad`] = textoDisponibles(existencia);
    }
  });

  if (Object.keys(fields).length > 0) {
    const hayExistencia = Object.keys(fields).some((key) =>
      key.endsWith("_cantidad")
    );
    return {
      ok: false,
      status: 400,
      message: hayExistencia
        ? "La cantidad supera la existencia disponible"
        : "Revise los productos del pedido",
      fields,
    };
  }

  const preparadas = lineas.map((linea) => {
    const producto = porId.get(linea.idProducto);
    return {
      idProducto: linea.idProducto,
      cantidad: linea.cantidad,
      precioUnitario: toNumber(producto.precioVenta),
      porcentajeImpuesto: toNumber(producto.porcentajeImpuesto),
      codigo: producto.codigo,
      nombre: producto.nombre,
      existencia: toNumber(producto.existenciaActual),
    };
  });

  return { ok: true, lineas: preparadas };
}

function mapLinea(row) {
  const cantidad = toNumber(row.cantidad);
  const precioUnitario = toNumber(row.precioUnitario);
  return {
    id: row.id,
    idProducto: row.idProducto,
    codigo: row.codigo,
    nombre: row.nombre,
    cantidad,
    precioUnitario,
    existencia: toNumber(row.existencia),
    subtotal: roundMoney(cantidad * precioUnitario),
  };
}

async function lineasDePedidos(ids) {
  if (!ids.length) return new Map();
  const rows = await db
    .select({
      id: ferDetallePedido.id,
      idPedido: ferDetallePedido.idPedido,
      idProducto: ferDetallePedido.idProducto,
      cantidad: ferDetallePedido.cantidad,
      precioUnitario: ferDetallePedido.precioUnitario,
      codigo: ferProducto.codigo,
      nombre: ferProducto.nombre,
      existencia: ferInventario.existenciaActual,
    })
    .from(ferDetallePedido)
    .innerJoin(ferProducto, eq(ferDetallePedido.idProducto, ferProducto.id))
    .leftJoin(ferInventario, eq(ferInventario.idProducto, ferProducto.id))
    .where(inArray(ferDetallePedido.idPedido, ids))
    .orderBy(asc(ferDetallePedido.id));

  const porPedido = new Map();
  for (const row of rows) {
    const lista = porPedido.get(row.idPedido) || [];
    lista.push(mapLinea(row));
    porPedido.set(row.idPedido, lista);
  }
  return porPedido;
}

function mapPedido(row, lineas, extra = {}) {
  const porcentaje = toNumber(row.porcentajeDescuento);
  const montos = totales(lineas, porcentaje);
  return {
    id: row.id,
    numeroPedido: row.numeroPedido,
    idCliente: row.idCliente,
    clienteNombre: nombreCliente(row),
    estado: row.estadoCodigo,
    estadoNombre: row.estadoNombre,
    porcentajeDescuento: porcentaje,
    fechaPedido: row.fechaPedido,
    editable: row.estadoCodigo === ESTADO_CREADO,
    creadoPor: extra.creadoPor ?? null,
    resueltoPor: extra.resueltoPor ?? null,
    canceladoPor: extra.canceladoPor ?? null,
    motivo:
      extra.motivo ??
      (row.estadoCodigo === ESTADO_CANCELADO ? row.observacion ?? null : null),
    ...montos,
    lineas,
  };
}

async function contextoPedidos(ids) {
  const mapa = new Map();
  if (!ids.length) return mapa;
  for (const id of ids) {
    mapa.set(id, {
      creadoPor: null,
      resueltoPor: null,
      canceladoPor: null,
      motivo: null,
      rechazado: false,
    });
  }

  const historias = await db
    .select({
      idPedido: ferHistorialPedido.idPedido,
      primerNombre: ferUsuario.primerNombre,
      primerApellido: ferUsuario.primerApellido,
    })
    .from(ferHistorialPedido)
    .innerJoin(ferUsuario, eq(ferHistorialPedido.idUsuario, ferUsuario.id))
    .where(
      and(
        inArray(ferHistorialPedido.idPedido, ids),
        isNull(ferHistorialPedido.idEstadoAnterior)
      )
    )
    .orderBy(asc(ferHistorialPedido.id));

  for (const row of historias) {
    const actual = mapa.get(row.idPedido);
    if (actual && !actual.creadoPor) actual.creadoPor = nombrePersona(row);
  }

  const aprobaciones = await db
    .select({
      idPedido: ferAprobacion.idPedido,
      estado: ferAprobacion.estado,
      observacion: ferAprobacion.observacion,
      primerNombre: ferUsuario.primerNombre,
      primerApellido: ferUsuario.primerApellido,
    })
    .from(ferAprobacion)
    .leftJoin(ferUsuario, eq(ferAprobacion.idUsuarioAutoriza, ferUsuario.id))
    .where(inArray(ferAprobacion.idPedido, ids))
    .orderBy(asc(ferAprobacion.id));

  for (const row of aprobaciones) {
    const actual = mapa.get(row.idPedido);
    if (!actual) continue;
    if (row.estado === "RECHAZADA") {
      const texto = row.observacion || "";
      if (texto.startsWith(MARCA_CANCELACION)) {
        actual.motivo = texto.slice(MARCA_CANCELACION.length);
      } else {
        actual.motivo = texto;
        actual.resueltoPor = nombrePersona(row);
        actual.rechazado = true;
      }
    } else if (row.estado === "APROBADA") {
      actual.resueltoPor = nombrePersona(row);
    }
  }

  const cancelaciones = await db
    .select({
      idPedido: ferHistorialPedido.idPedido,
      observacion: ferHistorialPedido.observacion,
      primerNombre: ferUsuario.primerNombre,
      primerApellido: ferUsuario.primerApellido,
    })
    .from(ferHistorialPedido)
    .innerJoin(
      ferEstadoPedido,
      eq(ferHistorialPedido.idEstadoNuevo, ferEstadoPedido.id)
    )
    .innerJoin(ferUsuario, eq(ferHistorialPedido.idUsuario, ferUsuario.id))
    .where(
      and(
        inArray(ferHistorialPedido.idPedido, ids),
        eq(ferEstadoPedido.codigo, ESTADO_CANCELADO)
      )
    )
    .orderBy(desc(ferHistorialPedido.id));

  for (const row of cancelaciones) {
    const actual = mapa.get(row.idPedido);
    if (!actual || actual.rechazado || actual.canceladoPor) continue;
    actual.canceladoPor = nombrePersona(row);
    if (!actual.motivo) actual.motivo = row.observacion;
  }

  return mapa;
}

async function pedidoCompleto(id) {
  const [row] = await consultaPedido().where(eq(ferPedido.id, id)).limit(1);
  if (!row) return null;
  const detalles = await lineasDePedidos([id]);
  const contexto = await contextoPedidos([id]);
  return mapPedido(row, detalles.get(id) || [], contexto.get(id));
}

const pedidoSelect = {
  id: ferPedido.id,
  numeroPedido: ferPedido.numeroPedido,
  idCliente: ferPedido.idCliente,
  porcentajeDescuento: ferPedido.porcentajeDescuento,
  fechaPedido: ferPedido.fechaPedido,
  observacion: ferPedido.observacion,
  estadoCodigo: ferEstadoPedido.codigo,
  estadoNombre: ferEstadoPedido.nombre,
  tipoPersona: ferCliente.tipoPersona,
  razonSocial: ferCliente.razonSocial,
  primerNombre: ferCliente.primerNombre,
  primerApellido: ferCliente.primerApellido,
};

function consultaPedido() {
  return db
    .select(pedidoSelect)
    .from(ferPedido)
    .innerJoin(ferCliente, eq(ferPedido.idCliente, ferCliente.id))
    .innerJoin(ferEstadoPedido, eq(ferPedido.idEstadoPedido, ferEstadoPedido.id));
}

router.get("/", requireRole(...ROLES), async (_req, res, next) => {
  try {
    const rows = await consultaPedido().orderBy(desc(ferPedido.id));
    const detalles = await lineasDePedidos(rows.map((row) => row.id));
    res.json({
      success: true,
      porcentajeMaximoSinAprobacion: PORCENTAJE_MAXIMO_SIN_APROBACION,
      data: rows.map((row) => mapPedido(row, detalles.get(row.id) || [])),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", requireRole(...ROLES), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: "Pedido no válido" });
    }

    const data = await pedidoCompleto(id);
    if (!data) {
      return res.status(404).json({ success: false, message: "Pedido no encontrado" });
    }

    res.json({
      success: true,
      porcentajeMaximoSinAprobacion: PORCENTAJE_MAXIMO_SIN_APROBACION,
      data,
    });
  } catch (error) {
    next(error);
  }
});

async function guardarPedido(tx, { existente, body, usuarioId }) {
  const cliente = await validarClienteActivo(tx, body.idCliente);
  if (!cliente.ok) return { error: cliente };

  const productos = await prepararLineas(tx, body.lineas);
  if (!productos.ok) return { error: productos };

  const catalogo = await estadosPorCodigo(tx);
  const creado = catalogo[ESTADO_CREADO];
  const pendiente = catalogo[ESTADO_PENDIENTE];
  const aprobado = catalogo[ESTADO_APROBADO];
  if (!creado || !pendiente || !aprobado) {
    return {
      error: {
        ok: false,
        status: 500,
        message: "Faltan los estados del pedido en la base de datos",
      },
    };
  }

  if (existente && existente.estadoCodigo !== ESTADO_CREADO) {
    return {
      error: {
        ok: false,
        status: 400,
        message: "El pedido ya fue enviado y no se puede editar",
      },
    };
  }

  const supera =
    body.porcentajeDescuento > PORCENTAJE_MAXIMO_SIN_APROBACION;
  const estadoDestino = !body.enviar
    ? creado
    : supera
      ? pendiente
      : aprobado;

  const porcentaje = body.porcentajeDescuento.toFixed(2);
  let pedido;

  if (!existente) {
    const numeroPedido = await generarNumeroPedido(tx);
    [pedido] = await tx
      .insert(ferPedido)
      .values({
        idCliente: body.idCliente,
        idEstadoPedido: estadoDestino.id,
        numeroPedido,
        porcentajeDescuento: porcentaje,
      })
      .returning();

    await tx.insert(ferHistorialPedido).values({
      idPedido: pedido.id,
      idEstadoAnterior: null,
      idEstadoNuevo: estadoDestino.id,
      idUsuario: usuarioId,
      observacion: body.enviar ? "Pedido enviado" : "Pedido creado",
    });
  } else {
    [pedido] = await tx
      .update(ferPedido)
      .set({
        idCliente: body.idCliente,
        idEstadoPedido: estadoDestino.id,
        porcentajeDescuento: porcentaje,
      })
      .where(eq(ferPedido.id, existente.id))
      .returning();

    await tx
      .delete(ferDetallePedido)
      .where(eq(ferDetallePedido.idPedido, pedido.id));

    if (estadoDestino.id !== creado.id) {
      await tx.insert(ferHistorialPedido).values({
        idPedido: pedido.id,
        idEstadoAnterior: creado.id,
        idEstadoNuevo: estadoDestino.id,
        idUsuario: usuarioId,
        observacion: "Pedido enviado",
      });
    }
  }

  await tx.insert(ferDetallePedido).values(
    productos.lineas.map((linea) => ({
      idPedido: pedido.id,
      idProducto: linea.idProducto,
      cantidad: String(linea.cantidad),
      precioUnitario: linea.precioUnitario.toFixed(2),
      porcentajeDescuento: "0",
      porcentajeImpuesto: linea.porcentajeImpuesto.toFixed(2),
    }))
  );

  if (estadoDestino.codigo === ESTADO_PENDIENTE) {
    await tx.insert(ferAprobacion).values({
      idPedido: pedido.id,
      idUsuarioSolicita: usuarioId,
      tipoAprobacion: "DESCUENTO",
      valorSolicitado: body.porcentajeDescuento.toFixed(2),
      valorPermitido: PORCENTAJE_MAXIMO_SIN_APROBACION.toFixed(2),
      estado: "PENDIENTE",
      observacion: `Descuento de ${body.porcentajeDescuento}% superior al ${PORCENTAJE_MAXIMO_SIN_APROBACION}% permitido`,
    });
  }

  return { pedidoId: pedido.id };
}

router.post("/", requireRole(...ROLES), async (req, res, next) => {
  try {
    const parsed = pedidoBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Revise el cliente, los productos y el descuento",
        fields: fieldErrorsFromZod(parsed.error),
      });
    }

    const resultado = await db.transaction((tx) =>
      guardarPedido(tx, {
        existente: null,
        body: parsed.data,
        usuarioId: Number(req.user.sub),
      })
    );

    if (resultado.error) {
      const error = resultado.error;
      return res.status(error.status).json({
        success: false,
        message: error.message,
        fields: error.fields,
      });
    }

    const [row] = await consultaPedido()
      .where(eq(ferPedido.id, resultado.pedidoId))
      .limit(1);
    const detalles = await lineasDePedidos([resultado.pedidoId]);
    const data = mapPedido(row, detalles.get(resultado.pedidoId) || []);
    await registrarAuditoria({
      idUsuario: Number(req.user.sub),
      modulo: "PEDIDOS",
      accion: data.estado === "CREADO" ? "CREAR" : "CAMBIO_ESTADO",
      entidad: "FER_PEDIDO",
      idRegistro: data.id,
      registro: data.numeroPedido,
      mensaje: `Pedido ${data.numeroPedido} en estado ${data.estadoNombre || data.estado}`,
    });
    res.status(201).json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", requireRole(...ROLES), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: "Pedido no válido" });
    }

    const parsed = pedidoBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Revise el cliente, los productos y el descuento",
        fields: fieldErrorsFromZod(parsed.error),
      });
    }

    const [existente] = await consultaPedido().where(eq(ferPedido.id, id)).limit(1);
    if (!existente) {
      return res.status(404).json({ success: false, message: "Pedido no encontrado" });
    }

    const resultado = await db.transaction((tx) =>
      guardarPedido(tx, {
        existente,
        body: parsed.data,
        usuarioId: Number(req.user.sub),
      })
    );

    if (resultado.error) {
      const error = resultado.error;
      return res.status(error.status).json({
        success: false,
        message: error.message,
        fields: error.fields,
      });
    }

    const [row] = await consultaPedido().where(eq(ferPedido.id, id)).limit(1);
    const detalles = await lineasDePedidos([id]);
    const data = mapPedido(row, detalles.get(id) || []);
    await registrarAuditoria({
      idUsuario: Number(req.user.sub),
      modulo: "PEDIDOS",
      accion: data.estado === "CREADO" ? "MODIFICAR" : "CAMBIO_ESTADO",
      entidad: "FER_PEDIDO",
      idRegistro: data.id,
      registro: data.numeroPedido,
      mensaje: `Pedido ${data.numeroPedido} en estado ${data.estadoNombre || data.estado}`,
    });
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    next(error);
  }
});

const motivoSchema = z.object({
  motivo: z.preprocess(
    (v) => (v == null ? "" : v),
    z
      .string()
      .trim()
      .min(1, "Escriba por qué rechaza el pedido")
      .max(500, "El motivo no puede tener más de 500 caracteres")
  ),
});

async function resolverPedido(tx, { id, aprobar, motivo, usuarioId }) {
  const [pedido] = await tx
    .select({
      id: ferPedido.id,
      numeroPedido: ferPedido.numeroPedido,
      porcentajeDescuento: ferPedido.porcentajeDescuento,
      estadoCodigo: ferEstadoPedido.codigo,
      idEstadoPedido: ferPedido.idEstadoPedido,
    })
    .from(ferPedido)
    .innerJoin(ferEstadoPedido, eq(ferPedido.idEstadoPedido, ferEstadoPedido.id))
    .where(eq(ferPedido.id, id))
    .limit(1);

  if (!pedido) {
    return { error: { status: 404, message: "Pedido no encontrado" } };
  }
  if (pedido.estadoCodigo !== ESTADO_PENDIENTE) {
    return {
      error: {
        status: 400,
        message: "Solo se puede decidir un pedido que está pendiente de aprobación",
      },
    };
  }

  const [solicitud] = await tx
    .select()
    .from(ferAprobacion)
    .where(
      and(eq(ferAprobacion.idPedido, id), eq(ferAprobacion.estado, "PENDIENTE"))
    )
    .limit(1);

  if (!solicitud) {
    return {
      error: {
        status: 400,
        message: "Este pedido no tiene una autorización pendiente",
      },
    };
  }

  const catalogo = await estadosPorCodigo(tx);
  const destino = aprobar ? catalogo[ESTADO_APROBADO] : catalogo[ESTADO_CANCELADO];
  const origen = catalogo[ESTADO_PENDIENTE];
  if (!destino || !origen) {
    return {
      error: {
        status: 500,
        message: "Faltan los estados del pedido en la base de datos",
      },
    };
  }

  const [usuario] = await tx
    .select({
      primerNombre: ferUsuario.primerNombre,
      primerApellido: ferUsuario.primerApellido,
    })
    .from(ferUsuario)
    .where(eq(ferUsuario.id, usuarioId))
    .limit(1);
  const quien = nombrePersona(usuario) || "Usuario";

  await tx
    .update(ferPedido)
    .set({
      idEstadoPedido: destino.id,
      ...(aprobar ? {} : { observacion: motivo }),
    })
    .where(eq(ferPedido.id, id));

  await tx
    .update(ferAprobacion)
    .set({
      estado: aprobar ? "APROBADA" : "RECHAZADA",
      idUsuarioAutoriza: usuarioId,
      fechaRespuesta: new Date(),
      observacion: aprobar ? solicitud.observacion : motivo,
    })
    .where(eq(ferAprobacion.id, solicitud.id));

  await tx.insert(ferHistorialPedido).values({
    idPedido: id,
    idEstadoAnterior: origen.id,
    idEstadoNuevo: destino.id,
    idUsuario: usuarioId,
    observacion: aprobar ? "Pedido aprobado" : motivo,
  });

  await tx.insert(ferAuditoria).values({
    idUsuario: usuarioId,
    modulo: "PEDIDOS",
    accion: aprobar ? "APROBAR" : "RECHAZAR",
    entidad: "FER_PEDIDO",
    idRegistro: id,
    valorAnterior: {
      estado: ESTADO_PENDIENTE,
      descuento: toNumber(pedido.porcentajeDescuento),
    },
    valorNuevo: {
      estado: destino.codigo,
      resueltoPor: quien,
      motivo: aprobar ? null : motivo,
      registro: pedido.numeroPedido,
    },
    resultado: "EXITO",
    mensaje: (aprobar
      ? `${quien} aprobó el pedido ${pedido.numeroPedido}`
      : `${quien} rechazó el pedido ${pedido.numeroPedido}: ${motivo}`
    ).slice(0, 500),
  });

  return { ok: true };
}

router.post("/:id/aprobar", requireRole(...ROLES_APROBACION), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: "Pedido no válido" });
    }

    const resultado = await db.transaction((tx) =>
      resolverPedido(tx, {
        id,
        aprobar: true,
        usuarioId: Number(req.user.sub),
      })
    );

    if (resultado.error) {
      return res.status(resultado.error.status).json({
        success: false,
        message: resultado.error.message,
      });
    }

    res.json({ success: true, data: await pedidoCompleto(id) });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/rechazar", requireRole(...ROLES_APROBACION), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: "Pedido no válido" });
    }

    const parsed = motivoSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Escriba por qué rechaza el pedido",
        fields: { motivo: parsed.error.issues[0]?.message },
      });
    }

    const resultado = await db.transaction((tx) =>
      resolverPedido(tx, {
        id,
        aprobar: false,
        motivo: parsed.data.motivo,
        usuarioId: Number(req.user.sub),
      })
    );

    if (resultado.error) {
      return res.status(resultado.error.status).json({
        success: false,
        message: resultado.error.message,
      });
    }

    res.json({ success: true, data: await pedidoCompleto(id) });
  } catch (error) {
    next(error);
  }
});

const motivoCancelacionSchema = z.object({
  motivo: z.preprocess(
    (v) => (v == null ? "" : v),
    z
      .string()
      .trim()
      .min(1, "Escriba por qué se cancela el pedido")
      .max(500, "El motivo no puede tener más de 500 caracteres")
  ),
});

async function cancelarPedido(tx, { id, motivo, usuarioId }) {
  const [pedido] = await tx
    .select({
      id: ferPedido.id,
      numeroPedido: ferPedido.numeroPedido,
      estadoCodigo: ferEstadoPedido.codigo,
      idEstadoPedido: ferPedido.idEstadoPedido,
    })
    .from(ferPedido)
    .innerJoin(ferEstadoPedido, eq(ferPedido.idEstadoPedido, ferEstadoPedido.id))
    .where(eq(ferPedido.id, id))
    .limit(1)
    .for("update");

  if (!pedido) {
    return { error: { status: 404, message: "Pedido no encontrado" } };
  }

  const [venta] = await tx
    .select({ id: ferVenta.id })
    .from(ferVenta)
    .where(eq(ferVenta.idPedido, id))
    .limit(1);
  if (venta || !ESTADOS_CANCELABLES.has(pedido.estadoCodigo)) {
    if (pedido.estadoCodigo === ESTADO_CANCELADO) {
      return {
        error: {
          status: 400,
          message: "El pedido ya está cancelado y no se puede volver a activar",
        },
      };
    }
    return {
      error: {
        status: 400,
        message: "Este pedido ya tiene una venta y no se puede cancelar",
      },
    };
  }

  const catalogo = await estadosPorCodigo(tx);
  const destino = catalogo[ESTADO_CANCELADO];
  if (!destino) {
    throw new Error("Falta el estado Cancelado en la base de datos");
  }

  const [usuario] = await tx
    .select({
      primerNombre: ferUsuario.primerNombre,
      primerApellido: ferUsuario.primerApellido,
    })
    .from(ferUsuario)
    .where(eq(ferUsuario.id, usuarioId))
    .limit(1);
  const quien = nombrePersona(usuario) || "Usuario";

  await tx
    .update(ferPedido)
    .set({
      idEstadoPedido: destino.id,
      observacion: motivo,
    })
    .where(eq(ferPedido.id, id));

  const [pendiente] = await tx
    .select({ id: ferAprobacion.id })
    .from(ferAprobacion)
    .where(and(eq(ferAprobacion.idPedido, id), eq(ferAprobacion.estado, "PENDIENTE")))
    .limit(1);
  if (pendiente) {
    await tx
      .update(ferAprobacion)
      .set({
        estado: "RECHAZADA",
        idUsuarioAutoriza: usuarioId,
        fechaRespuesta: new Date(),
        observacion: `${MARCA_CANCELACION}${motivo}`.slice(0, 500),
      })
      .where(eq(ferAprobacion.id, pendiente.id));
  }

  await tx.insert(ferHistorialPedido).values({
    idPedido: id,
    idEstadoAnterior: pedido.idEstadoPedido,
    idEstadoNuevo: destino.id,
    idUsuario: usuarioId,
    observacion: motivo,
  });

  return { numeroPedido: pedido.numeroPedido, estadoAnterior: pedido.estadoCodigo, quien };
}

router.post("/:id/cancelar", requireRole(...ROLES), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: "Pedido no válido" });
    }

    const parsed = motivoCancelacionSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Escriba por qué se cancela el pedido",
        fields: { motivo: parsed.error.issues[0]?.message },
      });
    }

    const motivo = parsed.data.motivo;
    const usuarioId = Number(req.user.sub);
    const resultado = await db.transaction((tx) =>
      cancelarPedido(tx, { id, motivo, usuarioId })
    );

    if (resultado.error) {
      return res.status(resultado.error.status).json({
        success: false,
        message: resultado.error.message,
      });
    }

    await registrarAuditoria({
      idUsuario: usuarioId,
      modulo: "PEDIDOS",
      accion: "CAMBIO_ESTADO",
      entidad: "FER_PEDIDO",
      idRegistro: id,
      registro: resultado.numeroPedido,
      valorAnterior: { estado: resultado.estadoAnterior },
      valorNuevo: { estado: ESTADO_CANCELADO, motivo },
      mensaje: `${resultado.quien} canceló el pedido ${resultado.numeroPedido}: ${motivo}`,
    });

    res.json({ success: true, data: await pedidoCompleto(id) });
  } catch (error) {
    next(error);
  }
});

export default router;
