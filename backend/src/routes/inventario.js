import { Router } from "express";
import { desc, eq } from "drizzle-orm";
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
  async (_req, res, next) => {
    try {
      const rows = await db
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
        .limit(200);

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
