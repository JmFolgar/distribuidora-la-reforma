import { Router } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  ferMovimientoInventario,
  ferInventario,
  ferProducto,
  ferUsuario,
} from "../db/schema.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

const ROLES_INVENTARIO = ["ADMINISTRADOR", "SUPERVISOR"];

const TIPOS = ["ENTRADA", "SALIDA", "AJUSTE", "DEVOLUCION"];
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;

function toNumber(value) {
  if (value == null || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function nombreUsuario(row) {
  const partes = [
    row.primerNombre,
    row.segundoNombre,
    row.primerApellido,
    row.segundoApellido,
  ].filter(Boolean);
  return partes.join(" ").trim() || row.nombreUsuario || "—";
}

router.get(
  "/movimientos",
  requireRole(...ROLES_INVENTARIO),
  async (req, res, next) => {
    try {
      const idProducto = Number(req.query.idProducto);
      const tipo = String(req.query.tipo || "").trim().toUpperCase();
      const fechaDesde = String(req.query.fechaDesde || "").trim();
      const fechaHasta = String(req.query.fechaHasta || "").trim();

      if (req.query.idProducto && (!Number.isInteger(idProducto) || idProducto <= 0)) {
        return res.status(400).json({
          success: false,
          message: "El producto del filtro no es válido",
        });
      }
      if (tipo && !TIPOS.includes(tipo)) {
        return res.status(400).json({
          success: false,
          message: "El tipo de movimiento no es válido",
        });
      }
      if (
        (fechaDesde && !FECHA_ISO.test(fechaDesde)) ||
        (fechaHasta && !FECHA_ISO.test(fechaHasta))
      ) {
        return res.status(400).json({
          success: false,
          message: "El rango de fechas no es válido",
        });
      }
      const anioValido = (fecha) => {
        const anio = Number(fecha.slice(0, 4));
        return anio >= 2000 && anio <= 2100;
      };
      if (
        (fechaDesde && !anioValido(fechaDesde)) ||
        (fechaHasta && !anioValido(fechaHasta))
      ) {
        return res.status(400).json({
          success: false,
          message: "La fecha no es válida",
        });
      }
      const hoy = new Date().toLocaleDateString("en-CA", {
        timeZone: "America/Guatemala",
      });
      if (
        (fechaDesde && fechaDesde > hoy) ||
        (fechaHasta && fechaHasta > hoy)
      ) {
        return res.status(400).json({
          success: false,
          message: "La fecha no puede ser posterior a hoy",
        });
      }
      if (fechaDesde && fechaHasta && fechaDesde > fechaHasta) {
        return res.status(400).json({
          success: false,
          message: "La fecha inicial no puede ser posterior a la fecha final",
        });
      }

      const fechaLocal = sql`(${ferMovimientoInventario.fechaMovimiento} AT TIME ZONE 'America/Guatemala')::date`;
      const condiciones = [];
      if (Number.isInteger(idProducto) && idProducto > 0) {
        condiciones.push(eq(ferProducto.id, idProducto));
      }
      if (tipo) {
        condiciones.push(eq(ferMovimientoInventario.tipoMovimiento, tipo));
      }
      if (fechaDesde) {
        condiciones.push(sql`${fechaLocal} >= ${fechaDesde}::date`);
      }
      if (fechaHasta) {
        condiciones.push(sql`${fechaLocal} <= ${fechaHasta}::date`);
      }

      let query = db
        .select({
          id: ferMovimientoInventario.id,
          tipoMovimiento: ferMovimientoInventario.tipoMovimiento,
          cantidad: ferMovimientoInventario.cantidad,
          existenciaAnterior: ferMovimientoInventario.existenciaAnterior,
          existenciaNueva: ferMovimientoInventario.existenciaNueva,
          fechaMovimiento: ferMovimientoInventario.fechaMovimiento,
          moduloOrigen: ferMovimientoInventario.moduloOrigen,
          numeroDocumento: ferMovimientoInventario.numeroDocumento,
          motivo: ferMovimientoInventario.motivo,
          idProducto: ferProducto.id,
          codigoProducto: ferProducto.codigo,
          nombreProducto: ferProducto.nombre,
          primerNombre: ferUsuario.primerNombre,
          segundoNombre: ferUsuario.segundoNombre,
          primerApellido: ferUsuario.primerApellido,
          segundoApellido: ferUsuario.segundoApellido,
          nombreUsuario: ferUsuario.nombreUsuario,
        })
        .from(ferMovimientoInventario)
        .innerJoin(
          ferInventario,
          eq(ferMovimientoInventario.idInventario, ferInventario.id)
        )
        .innerJoin(ferProducto, eq(ferInventario.idProducto, ferProducto.id))
        .innerJoin(
          ferUsuario,
          eq(ferMovimientoInventario.idUsuario, ferUsuario.id)
        )
        .orderBy(desc(ferMovimientoInventario.fechaMovimiento))
        .limit(500);

      if (condiciones.length > 0) {
        query = query.where(and(...condiciones));
      }

      const rows = await query;

      res.json({
        success: true,
        data: rows.map((r) => ({
          id: r.id,
          tipo: r.tipoMovimiento,
          cantidad: toNumber(r.cantidad),
          existenciaAnterior: toNumber(r.existenciaAnterior),
          existenciaNueva: toNumber(r.existenciaNueva),
          fechaMovimiento: r.fechaMovimiento,
          moduloOrigen: r.moduloOrigen,
          numeroDocumento: r.numeroDocumento,
          motivo: r.motivo,
          idProducto: r.idProducto,
          codigoProducto: r.codigoProducto,
          nombreProducto: r.nombreProducto,
          usuarioNombre: nombreUsuario(r),
        })),
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
