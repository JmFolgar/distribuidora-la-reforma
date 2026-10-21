import { Router } from "express";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  ferAprobacion,
  ferCliente,
  ferDetallePedido,
  ferEstadoPedido,
  ferHistorialPedido,
  ferInventario,
  ferPedido,
  ferProducto,
} from "../db/schema.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { enteroPositivo } from "../validacion.js";

const router = Router();

router.use(requireAuth);

const ROLES = ["ADMINISTRADOR", "SUPERVISOR", "OPERADOR"];

/** Porcentaje de descuento que se puede aplicar sin que un supervisor lo autorice. */
export const PORCENTAJE_MAXIMO_SIN_APROBACION = 10;

const ESTADO_CREADO = "CREADO";
const ESTADO_PENDIENTE = "PENDIENTE_APROBACION";
const ESTADO_APROBADO = "APROBADO";

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

function mapPedido(row, lineas) {
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
    ...montos,
    lineas,
  };
}

const pedidoSelect = {
  id: ferPedido.id,
  numeroPedido: ferPedido.numeroPedido,
  idCliente: ferPedido.idCliente,
  porcentajeDescuento: ferPedido.porcentajeDescuento,
  fechaPedido: ferPedido.fechaPedido,
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

    const [row] = await consultaPedido().where(eq(ferPedido.id, id)).limit(1);
    if (!row) {
      return res.status(404).json({ success: false, message: "Pedido no encontrado" });
    }

    const detalles = await lineasDePedidos([id]);
    res.json({
      success: true,
      porcentajeMaximoSinAprobacion: PORCENTAJE_MAXIMO_SIN_APROBACION,
      data: mapPedido(row, detalles.get(id) || []),
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
    res.status(201).json({
      success: true,
      data: mapPedido(row, detalles.get(resultado.pedidoId) || []),
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
    res.json({
      success: true,
      data: mapPedido(row, detalles.get(id) || []),
    });
  } catch (error) {
    next(error);
  }
});

export default router;
