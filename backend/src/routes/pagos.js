import { Router } from "express";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  ferCliente,
  ferDetalleVenta,
  ferEstadoPedido,
  ferHistorialPedido,
  ferMetodoPago,
  ferPago,
  ferPedido,
  ferVenta,
} from "../db/schema.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { montoPositivo } from "../validacion.js";
import { registrarAuditoria } from "../auditoria.js";

const router = Router();

router.use(requireAuth);

const ROLES = ["ADMINISTRADOR", "SUPERVISOR", "OPERADOR"];
const ESTADO_EN_PROCESO = "EN_PROCESO";
const ESTADO_COMPLETADO = "COMPLETADO";

const pagoBodySchema = z.object({
  idVenta: z.coerce
    .number({ invalid_type_error: "Seleccione una venta" })
    .int()
    .positive("Seleccione una venta"),
  idMetodoPago: z.coerce
    .number({ invalid_type_error: "Seleccione una forma de pago" })
    .int()
    .positive("Seleccione una forma de pago"),
  monto: montoPositivo("El monto es obligatorio", "El monto debe ser mayor a 0"),
  referencia: z.string().trim().max(100, "La referencia admite hasta 100 caracteres").optional(),
});

function toNumber(value) {
  if (value == null || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function centavos(n) {
  return Math.round(roundMoney(n) * 100);
}

function textoMonto(n) {
  return toNumber(n).toLocaleString("es-GT", {
    style: "currency",
    currency: "GTQ",
    minimumFractionDigits: 2,
  });
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
  return roundMoney(subtotal - descuento);
}

async function generarNumeroPago(tx) {
  const year = new Date().getFullYear();
  const prefix = `PAG-${year}-`;
  const [row] = await tx
    .select({ numero: ferPago.numeroPago })
    .from(ferPago)
    .where(sql`${ferPago.numeroPago} LIKE ${prefix + "%"}`)
    .orderBy(desc(ferPago.numeroPago))
    .limit(1);

  let secuencia = 1;
  if (row?.numero) {
    const parsed = Number.parseInt(row.numero.slice(prefix.length), 10);
    if (Number.isFinite(parsed)) secuencia = parsed + 1;
  }
  return `${prefix}${String(secuencia).padStart(5, "0")}`;
}

router.get("/metodos", requireRole(...ROLES), async (_req, res, next) => {
  try {
    const rows = await db
      .select({
        id: ferMetodoPago.id,
        codigo: ferMetodoPago.codigo,
        nombre: ferMetodoPago.nombre,
        requiereReferencia: ferMetodoPago.requiereReferencia,
      })
      .from(ferMetodoPago)
      .where(eq(ferMetodoPago.estado, "A"))
      .orderBy(asc(ferMetodoPago.id));
    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
});

router.get("/", requireRole(...ROLES), async (_req, res, next) => {
  try {
    const rows = await db
      .select({
        id: ferPago.id,
        numeroPago: ferPago.numeroPago,
        fechaPago: ferPago.fechaPago,
        monto: ferPago.monto,
        referencia: ferPago.referencia,
        estado: ferPago.estado,
        idVenta: ferVenta.id,
        numeroVenta: ferVenta.numeroFactura,
        metodoNombre: ferMetodoPago.nombre,
        metodoCodigo: ferMetodoPago.codigo,
        tipoPersona: ferCliente.tipoPersona,
        razonSocial: ferCliente.razonSocial,
        primerNombre: ferCliente.primerNombre,
        primerApellido: ferCliente.primerApellido,
      })
      .from(ferPago)
      .innerJoin(ferVenta, eq(ferPago.idVenta, ferVenta.id))
      .innerJoin(ferPedido, eq(ferVenta.idPedido, ferPedido.id))
      .innerJoin(ferCliente, eq(ferPedido.idCliente, ferCliente.id))
      .innerJoin(ferMetodoPago, eq(ferPago.idMetodoPago, ferMetodoPago.id))
      .orderBy(desc(ferPago.id));

    res.json({
      success: true,
      data: rows.map((row) => ({
        id: row.id,
        numeroPago: row.numeroPago,
        fechaPago: row.fechaPago,
        monto: toNumber(row.monto),
        referencia: row.referencia,
        estado: row.estado,
        idVenta: row.idVenta,
        numeroVenta: row.numeroVenta,
        clienteNombre: nombreCliente(row),
        metodoNombre: row.metodoNombre,
        metodoCodigo: row.metodoCodigo,
      })),
    });
  } catch (error) {
    next(error);
  }
});

async function registrarPago(tx, { idVenta, idMetodoPago, monto, referencia, usuarioId }) {
  const [venta] = await tx
    .select({
      id: ferVenta.id,
      estadoVenta: ferVenta.estado,
      idPedido: ferPedido.id,
      numeroPedido: ferPedido.numeroPedido,
      porcentajeDescuento: ferPedido.porcentajeDescuento,
      estadoPedido: ferEstadoPedido.codigo,
      idEstadoPedido: ferEstadoPedido.id,
    })
    .from(ferVenta)
    .innerJoin(ferPedido, eq(ferVenta.idPedido, ferPedido.id))
    .innerJoin(ferEstadoPedido, eq(ferPedido.idEstadoPedido, ferEstadoPedido.id))
    .where(eq(ferVenta.id, idVenta))
    .limit(1)
    .for("update");

  if (!venta) throw httpError(404, "Venta no encontrada");
  if (venta.estadoVenta !== "FINALIZADA") {
    throw httpError(400, "Solo se puede cobrar una venta ya registrada");
  }

  const [metodo] = await tx
    .select({
      id: ferMetodoPago.id,
      requiereReferencia: ferMetodoPago.requiereReferencia,
      estado: ferMetodoPago.estado,
    })
    .from(ferMetodoPago)
    .where(eq(ferMetodoPago.id, idMetodoPago))
    .limit(1);
  if (!metodo || metodo.estado !== "A") {
    throw httpError(400, "Seleccione una forma de pago", {
      idMetodoPago: "Seleccione una forma de pago",
    });
  }
  const referenciaLimpia = (referencia || "").trim();
  if (metodo.requiereReferencia && !referenciaLimpia) {
    throw httpError(400, "Escriba la referencia del pago", {
      referencia: "Escriba la referencia del pago",
    });
  }

  const lineas = await tx
    .select({
      cantidad: ferDetalleVenta.cantidad,
      precioUnitario: ferDetalleVenta.precioUnitario,
    })
    .from(ferDetalleVenta)
    .where(eq(ferDetalleVenta.idVenta, idVenta));
  const total = totales(lineas, venta.porcentajeDescuento);

  const suma = await tx.execute(sql`
    SELECT COALESCE(SUM("PAG_MONTO"), 0)::float AS pagado
    FROM "FER_PAGO"
    WHERE "PAG_ID_VENTA" = ${idVenta}
      AND "PAG_ESTADO" = 'REGISTRADO'
  `);
  const saldo = roundMoney(total - toNumber(suma.rows[0]?.pagado));
  if (centavos(saldo) <= 0) {
    throw httpError(400, "Esta venta ya no tiene saldo pendiente");
  }
  if (centavos(monto) > centavos(saldo)) {
    throw httpError(400, "El pago no puede ser mayor al saldo", {
      monto: `El pago no puede ser mayor al saldo. El saldo pendiente es ${textoMonto(saldo)}`,
    });
  }

  const numeroPago = await generarNumeroPago(tx);
  const [pago] = await tx
    .insert(ferPago)
    .values({
      idVenta,
      idMetodoPago,
      numeroPago,
      monto: monto.toFixed(2),
      referencia: referenciaLimpia || null,
      estado: "REGISTRADO",
    })
    .returning();

  const saldoNuevo = roundMoney(saldo - monto);
  let pedidoCompletado = false;
  if (centavos(saldoNuevo) === 0 && venta.estadoPedido === ESTADO_EN_PROCESO) {
    const [completado] = await tx
      .select({ id: ferEstadoPedido.id })
      .from(ferEstadoPedido)
      .where(eq(ferEstadoPedido.codigo, ESTADO_COMPLETADO))
      .limit(1);
    if (!completado) {
      throw new Error("Falta el estado Completado en la base de datos");
    }
    const [actualizado] = await tx
      .update(ferPedido)
      .set({ idEstadoPedido: completado.id })
      .where(
        and(
          eq(ferPedido.id, venta.idPedido),
          eq(ferPedido.idEstadoPedido, venta.idEstadoPedido)
        )
      )
      .returning({ id: ferPedido.id });
    if (!actualizado) {
      throw new Error("El pedido cambió mientras se registraba el pago");
    }
    await tx.insert(ferHistorialPedido).values({
      idPedido: venta.idPedido,
      idEstadoAnterior: venta.idEstadoPedido,
      idEstadoNuevo: completado.id,
      idUsuario: usuarioId,
      observacion: `Pago ${numeroPago}`,
    });
    pedidoCompletado = true;
  }

  return {
    id: pago.id,
    numeroPago,
    monto: roundMoney(monto),
    saldo: saldoNuevo,
    pedidoCompletado,
    idPedido: venta.idPedido,
    numeroPedido: venta.numeroPedido,
  };
}

router.post("/", requireRole(...ROLES), async (req, res) => {
  try {
    const parsed = pagoBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const fields = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key && !fields[key]) fields[key] = issue.message;
      }
      const primero = parsed.error.issues[0]?.message || "Revise el pago";
      return res.status(400).json({
        success: false,
        message: primero,
        fields,
      });
    }

    const resultado = await db.transaction((tx) =>
      registrarPago(tx, {
        ...parsed.data,
        usuarioId: Number(req.user.sub),
      })
    );

    await registrarAuditoria({
      idUsuario: Number(req.user.sub),
      modulo: "PAGOS",
      accion: "PAGO",
      entidad: "FER_PAGO",
      idRegistro: resultado.id,
      registro: resultado.numeroPago,
      mensaje: `Pago ${resultado.numeroPago} por ${resultado.monto}`,
    });
    if (resultado.pedidoCompletado) {
      await registrarAuditoria({
        idUsuario: Number(req.user.sub),
        modulo: "PEDIDOS",
        accion: "CAMBIO_ESTADO",
        entidad: "FER_PEDIDO",
        idRegistro: resultado.idPedido,
        registro: resultado.numeroPedido,
        mensaje: `El pedido ${resultado.numeroPedido} quedó completado con el pago ${resultado.numeroPago}`,
      });
    }

    res.status(201).json({ success: true, data: resultado });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
        fields: error.fields,
      });
    }
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "No se pudo registrar el pago. No se guardó ningún cambio. Intente de nuevo.",
    });
  }
});

export default router;
