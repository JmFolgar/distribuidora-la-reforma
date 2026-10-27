import { Router } from "express";
import { and, count, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  ferEstadoPedido,
  ferInventario,
  ferPedido,
  ferProducto,
} from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

function toNumber(value) {
  if (value == null || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function fechaHoy() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Guatemala" });
}

function desplazar(iso, dias) {
  const [anio, mes, dia] = iso.split("-").map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1, dia + dias));
  const y = fecha.getUTCFullYear();
  const m = String(fecha.getUTCMonth() + 1).padStart(2, "0");
  const d = String(fecha.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function claveMes(iso, meses) {
  const [anio, mes] = iso.split("-").map(Number);
  const fecha = new Date(Date.UTC(anio, mes - 1 + meses, 1));
  const y = fecha.getUTCFullYear();
  const m = String(fecha.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function totalVenta(subtotalBruto, porcentaje) {
  const subtotal = roundMoney(toNumber(subtotalBruto));
  const descuento = roundMoney(subtotal * (toNumber(porcentaje) / 100));
  return roundMoney(subtotal - descuento);
}

router.get("/", async (_req, res, next) => {
  try {
    const hoy = fechaHoy();
    const inicioMes = `${hoy.slice(0, 7)}-01`;
    const desde = desplazar(hoy, -29);

    const ventas = await db.execute(sql`
      SELECT v."VEN_ID_VENTA"::int AS id,
             to_char((v."VEN_FECHA_VENTA" AT TIME ZONE 'America/Guatemala'), 'YYYY-MM-DD') AS fecha,
             p."PED_PORCENTAJE_DESCUENTO"::float AS porcentaje,
             COALESCE(SUM(d."DVE_CANTIDAD" * d."DVE_PRECIO_UNITARIO"), 0)::float AS subtotal
      FROM "FER_VENTA" v
      INNER JOIN "FER_PEDIDO" p ON p."PED_ID_PEDIDO" = v."VEN_ID_PEDIDO"
      LEFT JOIN "FER_DETALLE_VENTA" d ON d."DVE_ID_VENTA" = v."VEN_ID_VENTA"
      WHERE v."VEN_ESTADO" = 'FINALIZADA'
      GROUP BY v."VEN_ID_VENTA", v."VEN_FECHA_VENTA", p."PED_PORCENTAJE_DESCUENTO"
    `);

    const pagos = await db.execute(sql`
      SELECT "PAG_ID_VENTA"::int AS id,
             COALESCE(SUM("PAG_MONTO"), 0)::float AS pagado
      FROM "FER_PAGO"
      WHERE "PAG_ESTADO" = 'REGISTRADO'
      GROUP BY "PAG_ID_VENTA"
    `);
    const pagadoPorVenta = new Map(
      pagos.rows.map((row) => [Number(row.id), toNumber(row.pagado)])
    );

    const porDia = new Map();
    let ventasDia = 0;
    let ventasMes = 0;
    let saldoPorCobrar = 0;

    for (const row of ventas.rows) {
      const total = totalVenta(row.subtotal, row.porcentaje);
      const fecha = String(row.fecha);
      porDia.set(fecha, roundMoney((porDia.get(fecha) || 0) + total));
      if (fecha === hoy) ventasDia = roundMoney(ventasDia + total);
      if (fecha >= inicioMes && fecha <= hoy) ventasMes = roundMoney(ventasMes + total);
      const saldo = roundMoney(total - (pagadoPorVenta.get(Number(row.id)) || 0));
      if (saldo > 0) saldoPorCobrar = roundMoney(saldoPorCobrar + saldo);
    }

    function serieDiaria(inicio, fin) {
      const puntos = [];
      let fecha = inicio;
      while (fecha <= fin) {
        puntos.push({ fecha, total: porDia.get(fecha) || 0 });
        fecha = desplazar(fecha, 1);
      }
      return puntos;
    }

    const ventasPorDia = serieDiaria(desde, hoy);
    const ventasDelMes = serieDiaria(inicioMes, hoy);
    const ventasPorMes = [];
    for (let i = -11; i <= 0; i += 1) {
      const clave = claveMes(hoy, i);
      let total = 0;
      for (const [fecha, monto] of porDia) {
        if (fecha.startsWith(clave)) total = roundMoney(total + monto);
      }
      ventasPorMes.push({ fecha: `${clave}-01`, total });
    }

    const [{ total: pedidosPendientes }] = await db
      .select({ total: count() })
      .from(ferPedido)
      .innerJoin(ferEstadoPedido, eq(ferPedido.idEstadoPedido, ferEstadoPedido.id))
      .where(eq(ferEstadoPedido.codigo, "PENDIENTE_APROBACION"));

    const [{ total: productosBajoMinimo }] = await db
      .select({ total: count() })
      .from(ferProducto)
      .leftJoin(ferInventario, eq(ferInventario.idProducto, ferProducto.id))
      .where(
        and(
          eq(ferProducto.estado, "A"),
          sql`COALESCE(${ferInventario.existenciaActual}, 0) <= ${ferProducto.existenciaMinima}`
        )
      );

    const masVendidos = await db.execute(sql`
      SELECT pr."PRO_ID_PRODUCTO"::int AS id,
             pr."PRO_CODIGO" AS codigo,
             pr."PRO_NOMBRE" AS nombre,
             SUM(d."DVE_CANTIDAD")::float AS cantidad
      FROM "FER_DETALLE_VENTA" d
      INNER JOIN "FER_VENTA" v ON v."VEN_ID_VENTA" = d."DVE_ID_VENTA"
      INNER JOIN "FER_DETALLE_PEDIDO" dp ON dp."DPE_ID_DETALLE_PEDIDO" = d."DVE_ID_DETALLE_PEDIDO"
      INNER JOIN "FER_PRODUCTO" pr ON pr."PRO_ID_PRODUCTO" = dp."DPE_ID_PRODUCTO"
      WHERE v."VEN_ESTADO" = 'FINALIZADA'
      GROUP BY pr."PRO_ID_PRODUCTO", pr."PRO_CODIGO", pr."PRO_NOMBRE"
      HAVING SUM(d."DVE_CANTIDAD") > 0
      ORDER BY SUM(d."DVE_CANTIDAD") DESC, pr."PRO_NOMBRE" ASC
      LIMIT 5
    `);

    res.json({
      success: true,
      data: {
        ventasDia,
        ventasMes,
        pedidosPendientes: Number(pedidosPendientes) || 0,
        productosBajoMinimo: Number(productosBajoMinimo) || 0,
        saldoPorCobrar,
        ventasPorDia,
        ventasDelMes,
        ventasPorMes,
        productosMasVendidos: masVendidos.rows.map((row) => ({
          id: Number(row.id),
          codigo: row.codigo,
          nombre: row.nombre,
          cantidad: toNumber(row.cantidad),
        })),
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
