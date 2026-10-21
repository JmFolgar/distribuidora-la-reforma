import { Router } from "express";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  ferCliente,
  ferDetalleVenta,
  ferMovimientoInventario,
  ferPedido,
  ferUsuario,
  ferVenta,
} from "../db/schema.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth, requireRole("ADMINISTRADOR", "SUPERVISOR"));

function toNumber(value) {
  if (value == null || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function nombrePersona(row) {
  return [row?.primerNombre, row?.primerApellido].filter(Boolean).join(" ");
}

function fechaHoy() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Guatemala" });
}

function fechaValida(valor) {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [anio, mes, dia] = valor.split("-").map(Number);
  if (anio < 2000 || anio > 2100) return false;
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    fecha.getUTCFullYear() === anio &&
    fecha.getUTCMonth() === mes - 1 &&
    fecha.getUTCDate() === dia
  );
}

router.get("/ventas", async (req, res, next) => {
  try {
    const desde = String(req.query.desde || "").trim();
    const hasta = String(req.query.hasta || "").trim();

    if (!desde || !hasta) {
      return res.status(400).json({
        success: false,
        message: "Indique la fecha inicial y la fecha final",
      });
    }
    if (!fechaValida(desde) || !fechaValida(hasta)) {
      return res.status(400).json({
        success: false,
        message: "La fecha no es válida",
      });
    }
    if (desde > fechaHoy() || hasta > fechaHoy()) {
      return res.status(400).json({
        success: false,
        message: "La fecha no puede ser posterior a hoy",
      });
    }
    if (desde > hasta) {
      return res.status(400).json({
        success: false,
        message: "La fecha inicial no puede ser posterior a la fecha final",
      });
    }

    const ventas = await db
      .select({
        id: ferVenta.id,
        numeroVenta: ferVenta.numeroFactura,
        fecha: ferVenta.fechaVenta,
        porcentajeDescuento: ferPedido.porcentajeDescuento,
        tipoPersona: ferCliente.tipoPersona,
        razonSocial: ferCliente.razonSocial,
        primerNombre: ferCliente.primerNombre,
        primerApellido: ferCliente.primerApellido,
      })
      .from(ferVenta)
      .innerJoin(ferPedido, eq(ferVenta.idPedido, ferPedido.id))
      .innerJoin(ferCliente, eq(ferPedido.idCliente, ferCliente.id))
      .where(
        and(
          eq(ferVenta.estado, "FINALIZADA"),
          sql`(${ferVenta.fechaVenta} AT TIME ZONE 'America/Guatemala')::date >= ${desde}`,
          sql`(${ferVenta.fechaVenta} AT TIME ZONE 'America/Guatemala')::date <= ${hasta}`
        )
      )
      .orderBy(asc(ferVenta.fechaVenta), asc(ferVenta.id));

    const ids = ventas.map((venta) => venta.id);
    const lineasPorVenta = new Map();
    const vendedorPorVenta = new Map();

    if (ids.length) {
      const lineas = await db
        .select({
          idVenta: ferDetalleVenta.idVenta,
          cantidad: ferDetalleVenta.cantidad,
          precioUnitario: ferDetalleVenta.precioUnitario,
        })
        .from(ferDetalleVenta)
        .where(inArray(ferDetalleVenta.idVenta, ids));

      for (const linea of lineas) {
        const lista = lineasPorVenta.get(linea.idVenta) || [];
        lista.push(linea);
        lineasPorVenta.set(linea.idVenta, lista);
      }

      const vendedores = await db
        .select({
          idVenta: ferMovimientoInventario.idRegistroOrigen,
          primerNombre: ferUsuario.primerNombre,
          primerApellido: ferUsuario.primerApellido,
        })
        .from(ferMovimientoInventario)
        .innerJoin(ferUsuario, eq(ferMovimientoInventario.idUsuario, ferUsuario.id))
        .where(
          and(
            eq(ferMovimientoInventario.moduloOrigen, "VENTAS"),
            inArray(ferMovimientoInventario.idRegistroOrigen, ids)
          )
        )
        .orderBy(asc(ferMovimientoInventario.id));

      for (const row of vendedores) {
        if (!vendedorPorVenta.has(row.idVenta)) {
          vendedorPorVenta.set(row.idVenta, nombrePersona(row));
        }
      }
    }

    const filas = ventas.map((venta) => {
      const lineas = lineasPorVenta.get(venta.id) || [];
      const subtotal = roundMoney(
        lineas.reduce(
          (sum, linea) => sum + toNumber(linea.cantidad) * toNumber(linea.precioUnitario),
          0
        )
      );
      const porcentaje = toNumber(venta.porcentajeDescuento);
      const descuento = roundMoney(subtotal * (porcentaje / 100));
      const cliente =
        venta.tipoPersona === "JURIDICA" && venta.razonSocial
          ? venta.razonSocial
          : nombrePersona(venta);
      return {
        id: venta.id,
        fecha: venta.fecha,
        numeroVenta: venta.numeroVenta,
        cliente,
        descuento: porcentaje,
        total: roundMoney(subtotal - descuento),
        vendidoPor: vendedorPorVenta.get(venta.id) || "—",
      };
    });

    const totalGeneral = roundMoney(filas.reduce((sum, fila) => sum + fila.total, 0));

    res.json({
      success: true,
      data: {
        desde,
        hasta,
        totalGeneral,
        ventas: filas,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
