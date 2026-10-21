import { Router } from "express";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  ferCliente,
  ferDetallePedido,
  ferDetalleVenta,
  ferEstadoPedido,
  ferHistorialPedido,
  ferInventario,
  ferMovimientoInventario,
  ferPedido,
  ferProducto,
  ferVenta,
} from "../db/schema.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { enteroPositivo } from "../validacion.js";
import { registrarAuditoria } from "../auditoria.js";

const router = Router();

router.use(requireAuth);

const ROLES = ["ADMINISTRADOR", "SUPERVISOR", "OPERADOR"];
const ESTADO_APROBADO = "APROBADO";
const ESTADO_PENDIENTE = "PENDIENTE_APROBACION";
const ESTADO_EN_PROCESO = "EN_PROCESO";
const MENSAJE_FALLO =
  "No se pudo registrar la venta. No se guardó ningún cambio. Intente de nuevo.";

const ventaBodySchema = z.object({
  idPedido: z.coerce
    .number({ invalid_type_error: "Seleccione un pedido" })
    .int()
    .positive("Seleccione un pedido"),
  lineas: z
    .array(
      z.object({
        idDetallePedido: z.coerce
          .number({ invalid_type_error: "Seleccione un producto" })
          .int()
          .positive("Seleccione un producto"),
        cantidad: enteroPositivo("La cantidad es obligatoria"),
      })
    )
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

function mismoNumero(a, b) {
  return Math.abs(toNumber(a) - toNumber(b)) < 0.0001;
}

function textoDisponibles(existencia) {
  const n = toNumber(existencia);
  const cantidad = Number.isInteger(n) ? String(n) : String(n);
  if (n === 1) return "Hay 1 unidad disponible";
  return `Hay ${cantidad} unidades disponibles`;
}

function nombreCliente(row) {
  if (row.tipoPersona === "JURIDICA" && row.razonSocial) return row.razonSocial;
  return [row.primerNombre, row.primerApellido].filter(Boolean).join(" ");
}

function httpError(status, message, fields) {
  const error = new Error(message);
  error.status = status;
  error.fields = fields;
  return error;
}

function totales(lineas, porcentaje) {
  const subtotal = roundMoney(
    lineas.reduce(
      (sum, linea) => sum + toNumber(linea.cantidad) * toNumber(linea.precioUnitario),
      0
    )
  );
  const descuento = roundMoney(subtotal * (toNumber(porcentaje) / 100));
  return { subtotal, descuento, total: roundMoney(subtotal - descuento) };
}

async function generarNumeroVenta(tx) {
  const year = new Date().getFullYear();
  const prefix = `VEN-${year}-`;
  const [row] = await tx
    .select({ numero: ferVenta.numeroFactura })
    .from(ferVenta)
    .where(sql`${ferVenta.numeroFactura} LIKE ${prefix + "%"}`)
    .orderBy(desc(ferVenta.numeroFactura))
    .limit(1);

  let secuencia = 1;
  if (row?.numero) {
    const parsed = Number.parseInt(row.numero.slice(prefix.length), 10);
    if (Number.isFinite(parsed)) secuencia = parsed + 1;
  }
  return `${prefix}${String(secuencia).padStart(5, "0")}`;
}

async function lineasDeVentas(ids) {
  const mapa = new Map();
  if (!ids.length) return mapa;
  const rows = await db
    .select({
      id: ferDetalleVenta.id,
      idVenta: ferDetalleVenta.idVenta,
      cantidad: ferDetalleVenta.cantidad,
      precioUnitario: ferDetalleVenta.precioUnitario,
      codigo: ferProducto.codigo,
      nombre: ferProducto.nombre,
    })
    .from(ferDetalleVenta)
    .innerJoin(
      ferDetallePedido,
      eq(ferDetalleVenta.idDetallePedido, ferDetallePedido.id)
    )
    .innerJoin(ferProducto, eq(ferDetallePedido.idProducto, ferProducto.id))
    .where(inArray(ferDetalleVenta.idVenta, ids))
    .orderBy(asc(ferDetalleVenta.id));

  for (const row of rows) {
    const lista = mapa.get(row.idVenta) || [];
    const cantidad = toNumber(row.cantidad);
    const precioUnitario = toNumber(row.precioUnitario);
    lista.push({
      id: row.id,
      codigo: row.codigo,
      nombre: row.nombre,
      cantidad,
      precioUnitario,
      subtotal: roundMoney(cantidad * precioUnitario),
    });
    mapa.set(row.idVenta, lista);
  }
  return mapa;
}

function mapVenta(row, lineas, pagado = 0) {
  const montos = totales(lineas, row.porcentajeDescuento);
  const abonado = roundMoney(pagado);
  return {
    id: row.id,
    numeroVenta: row.numeroFactura,
    estado: row.estado,
    fechaVenta: row.fechaVenta,
    idPedido: row.idPedido,
    numeroPedido: row.numeroPedido,
    clienteNombre: nombreCliente(row),
    porcentajeDescuento: toNumber(row.porcentajeDescuento),
    editable: false,
    ...montos,
    pagado: abonado,
    saldo: roundMoney(montos.total - abonado),
    lineas,
  };
}

async function pagadoPorVenta(ids) {
  const mapa = new Map();
  if (!ids.length) return mapa;
  const rows = await db.execute(sql`
    SELECT "PAG_ID_VENTA" AS id, COALESCE(SUM("PAG_MONTO"), 0)::float AS pagado
    FROM "FER_PAGO"
    WHERE "PAG_ESTADO" = 'REGISTRADO'
      AND "PAG_ID_VENTA" IN (${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `
      )})
    GROUP BY "PAG_ID_VENTA"
  `);
  for (const row of rows.rows) mapa.set(Number(row.id), toNumber(row.pagado));
  return mapa;
}

const ventaSelect = {
  id: ferVenta.id,
  numeroFactura: ferVenta.numeroFactura,
  estado: ferVenta.estado,
  fechaVenta: ferVenta.fechaVenta,
  idPedido: ferPedido.id,
  numeroPedido: ferPedido.numeroPedido,
  porcentajeDescuento: ferPedido.porcentajeDescuento,
  tipoPersona: ferCliente.tipoPersona,
  razonSocial: ferCliente.razonSocial,
  primerNombre: ferCliente.primerNombre,
  primerApellido: ferCliente.primerApellido,
};

function consultaVenta() {
  return db
    .select(ventaSelect)
    .from(ferVenta)
    .innerJoin(ferPedido, eq(ferVenta.idPedido, ferPedido.id))
    .innerJoin(ferCliente, eq(ferPedido.idCliente, ferCliente.id));
}

async function ventaCompleta(id) {
  const [row] = await consultaVenta().where(eq(ferVenta.id, id)).limit(1);
  if (!row) return null;
  const detalles = await lineasDeVentas([id]);
  const pagado = await pagadoPorVenta([id]);
  return mapVenta(row, detalles.get(id) || [], pagado.get(id) || 0);
}

router.get("/", requireRole(...ROLES), async (_req, res, next) => {
  try {
    const rows = await consultaVenta().orderBy(desc(ferVenta.id));
    const ids = rows.map((row) => row.id);
    const detalles = await lineasDeVentas(ids);
    const pagado = await pagadoPorVenta(ids);
    res.json({
      success: true,
      data: rows.map((row) =>
        mapVenta(row, detalles.get(row.id) || [], pagado.get(row.id) || 0)
      ),
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", requireRole(...ROLES), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: "Venta no válida" });
    }
    const data = await ventaCompleta(id);
    if (!data) {
      return res.status(404).json({ success: false, message: "Venta no encontrada" });
    }
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id", requireRole(...ROLES), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: "Venta no válida" });
    }
    const [venta] = await db
      .select({ id: ferVenta.id })
      .from(ferVenta)
      .where(eq(ferVenta.id, id))
      .limit(1);
    if (!venta) {
      return res.status(404).json({ success: false, message: "Venta no encontrada" });
    }
    return res.status(400).json({
      success: false,
      message: "La venta ya está finalizada y no se puede modificar",
    });
  } catch (error) {
    next(error);
  }
});

async function registrarVenta(tx, { idPedido, lineas, usuarioId }) {
  const [pedido] = await tx
    .select({
      id: ferPedido.id,
      numeroPedido: ferPedido.numeroPedido,
      porcentajeDescuento: ferPedido.porcentajeDescuento,
      estadoCodigo: ferEstadoPedido.codigo,
      idEstado: ferEstadoPedido.id,
    })
    .from(ferPedido)
    .innerJoin(ferEstadoPedido, eq(ferPedido.idEstadoPedido, ferEstadoPedido.id))
    .where(eq(ferPedido.id, idPedido))
    .limit(1)
    .for("update");

  if (!pedido) throw httpError(404, "Pedido no encontrado");
  if (pedido.estadoCodigo === ESTADO_PENDIENTE) {
    throw httpError(
      400,
      "El pedido está pendiente de aprobación. Un supervisor debe aprobarlo antes de registrar la venta"
    );
  }
  if (pedido.estadoCodigo !== ESTADO_APROBADO) {
    throw httpError(400, "Solo se puede registrar la venta de un pedido aprobado");
  }

  const [existente] = await tx
    .select({ id: ferVenta.id })
    .from(ferVenta)
    .where(eq(ferVenta.idPedido, idPedido))
    .limit(1);
  if (existente) throw httpError(409, "Este pedido ya tiene una venta");

  const detalles = await tx
    .select({
      id: ferDetallePedido.id,
      idProducto: ferDetallePedido.idProducto,
      cantidad: ferDetallePedido.cantidad,
      precioUnitario: ferDetallePedido.precioUnitario,
      porcentajeImpuesto: ferDetallePedido.porcentajeImpuesto,
      precioCompra: ferProducto.precioCompra,
      codigo: ferProducto.codigo,
      nombre: ferProducto.nombre,
    })
    .from(ferDetallePedido)
    .innerJoin(ferProducto, eq(ferDetallePedido.idProducto, ferProducto.id))
    .where(eq(ferDetallePedido.idPedido, idPedido))
    .orderBy(asc(ferDetallePedido.id));

  if (!lineas.length || !detalles.length) {
    throw httpError(400, "Debe agregar al menos un producto");
  }

  const porId = new Map(detalles.map((detalle) => [detalle.id, detalle]));
  const enviados = lineas.map((linea) => linea.idDetallePedido);
  if (new Set(enviados).size !== enviados.length) {
    throw httpError(400, "No puede repetir el mismo producto", {
      lineas: "Cada producto solo puede aparecer una vez",
    });
  }
  if (
    enviados.length !== detalles.length ||
    detalles.some((detalle) => !enviados.includes(detalle.id))
  ) {
    throw httpError(400, "Debe incluir todos los productos del pedido");
  }

  const fields = {};
  let faltaExistencia = false;
  lineas.forEach((linea, index) => {
    const detalle = porId.get(linea.idDetallePedido);
    if (!detalle) {
      fields[`lineas_${index}_idDetallePedido`] = "El producto no pertenece al pedido";
      return;
    }
    if (!mismoNumero(linea.cantidad, detalle.cantidad)) {
      fields[`lineas_${index}_cantidad`] = "La cantidad debe ser la del pedido";
    }
  });
  if (Object.keys(fields).length) {
    throw httpError(400, "Revise los productos de la venta", fields);
  }

  const preparados = [];
  const orden = [...lineas.entries()].sort(
    (a, b) =>
      porId.get(a[1].idDetallePedido).idProducto -
      porId.get(b[1].idDetallePedido).idProducto
  );
  for (const [index, linea] of orden) {
    const detalle = porId.get(linea.idDetallePedido);
    const [inventario] = await tx
      .select()
      .from(ferInventario)
      .where(eq(ferInventario.idProducto, detalle.idProducto))
      .limit(1)
      .for("update");

    const anterior = toNumber(inventario?.existenciaActual);
    if (!inventario || linea.cantidad > anterior) {
      faltaExistencia = true;
      fields[`lineas_${index}_cantidad`] = textoDisponibles(anterior);
      continue;
    }
    preparados.push({ linea, detalle, inventario, anterior });
  }
  if (faltaExistencia) {
    throw httpError(
      400,
      "No hay existencia suficiente para registrar la venta",
      fields
    );
  }

  const numeroVenta = await generarNumeroVenta(tx);
  const [venta] = await tx
    .insert(ferVenta)
    .values({
      idPedido,
      numeroFactura: numeroVenta,
      estado: "FINALIZADA",
      fechaFinalizacion: new Date(),
    })
    .returning();

  for (const item of preparados) {
    const { linea, detalle, inventario, anterior } = item;
    await tx.insert(ferDetalleVenta).values({
      idVenta: venta.id,
      idDetallePedido: detalle.id,
      cantidad: String(linea.cantidad),
      precioUnitario: toNumber(detalle.precioUnitario).toFixed(2),
      costoUnitario: toNumber(detalle.precioCompra).toFixed(2),
      porcentajeDescuento: toNumber(pedido.porcentajeDescuento).toFixed(2),
      porcentajeImpuesto: toNumber(detalle.porcentajeImpuesto).toFixed(2),
    });

    const nueva = Math.round((anterior - linea.cantidad) * 1000) / 1000;
    await tx
      .update(ferInventario)
      .set({
        existenciaActual: String(nueva),
        fechaUltimoMovimiento: sql`CURRENT_TIMESTAMP`,
        version: inventario.version + 1,
      })
      .where(eq(ferInventario.id, inventario.id));

    await tx.insert(ferMovimientoInventario).values({
      idInventario: inventario.id,
      idUsuario: usuarioId,
      tipoMovimiento: "SALIDA",
      cantidad: String(linea.cantidad),
      existenciaAnterior: String(anterior),
      existenciaNueva: String(nueva),
      moduloOrigen: "VENTAS",
      idRegistroOrigen: venta.id,
      numeroDocumento: numeroVenta,
      motivo: "Salida por venta",
    });
  }

  const [enProceso] = await tx
    .select({ id: ferEstadoPedido.id })
    .from(ferEstadoPedido)
    .where(eq(ferEstadoPedido.codigo, ESTADO_EN_PROCESO))
    .limit(1);
  if (!enProceso) {
    throw httpError(500, "Falta el estado En proceso en la base de datos");
  }

  const [pedidoActualizado] = await tx
    .update(ferPedido)
    .set({ idEstadoPedido: enProceso.id })
    .where(and(eq(ferPedido.id, idPedido), eq(ferPedido.idEstadoPedido, pedido.idEstado)))
    .returning({ id: ferPedido.id });
  if (!pedidoActualizado) {
    throw new Error("El pedido cambió mientras se registraba la venta");
  }

  await tx.insert(ferHistorialPedido).values({
    idPedido,
    idEstadoAnterior: pedido.idEstado,
    idEstadoNuevo: enProceso.id,
    idUsuario: usuarioId,
    observacion: `Venta ${numeroVenta}`,
  });

  return venta.id;
}

router.post("/", requireRole(...ROLES), async (req, res) => {
  try {
    const parsed = ventaBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const vacio = parsed.error.issues.some(
        (issue) => issue.path[0] === "lineas" && issue.code === "too_small"
      );
      return res.status(400).json({
        success: false,
        message: vacio
          ? "Debe agregar al menos un producto"
          : "Revise el pedido y los productos",
        fields: vacio ? { lineas: "Debe agregar al menos un producto" } : undefined,
      });
    }

    const ventaId = await db.transaction((tx) =>
      registrarVenta(tx, {
        idPedido: parsed.data.idPedido,
        lineas: parsed.data.lineas,
        usuarioId: Number(req.user.sub),
      })
    );

    const data = await ventaCompleta(ventaId);
    await registrarAuditoria({
      idUsuario: Number(req.user.sub),
      modulo: "VENTAS",
      accion: "VENTA",
      entidad: "FER_VENTA",
      idRegistro: data.id,
      registro: data.numeroVenta,
      mensaje: `Venta ${data.numeroVenta} del pedido ${data.numeroPedido}`,
    });
    await registrarAuditoria({
      idUsuario: Number(req.user.sub),
      modulo: "PEDIDOS",
      accion: "CAMBIO_ESTADO",
      entidad: "FER_PEDIDO",
      idRegistro: data.idPedido,
      registro: data.numeroPedido,
      mensaje: `El pedido ${data.numeroPedido} pasó a en proceso por la venta ${data.numeroVenta}`,
    });
    res.status(201).json({ success: true, data });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
        fields: error.fields,
      });
    }
    if (error.code === "23505") {
      return res.status(409).json({
        success: false,
        message: "Este pedido ya tiene una venta",
      });
    }
    console.error(error);
    return res.status(500).json({ success: false, message: MENSAJE_FALLO });
  }
});

export default router;
