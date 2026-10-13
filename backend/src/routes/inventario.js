import { Router } from "express";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
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

router.get("/alertas", requireRole(...ROLES_INVENTARIO), async (_req, res, next) => {
  try {
    const rows = await db
      .select({
        id: ferProducto.id,
        codigo: ferProducto.codigo,
        nombre: ferProducto.nombre,
        minimo: ferProducto.existenciaMinima,
        existencia: ferInventario.existenciaActual,
      })
      .from(ferProducto)
      .leftJoin(ferInventario, eq(ferInventario.idProducto, ferProducto.id))
      .where(
        and(
          eq(ferProducto.estado, "A"),
          sql`COALESCE(${ferInventario.existenciaActual}, 0) <= ${ferProducto.existenciaMinima}`
        )
      )
      .orderBy(asc(ferProducto.nombre));

    res.json({
      success: true,
      data: rows.map((r) => ({
        id: r.id,
        codigo: r.codigo,
        nombre: r.nombre,
        existencia: toNumber(r.existencia),
        minimo: toNumber(r.minimo),
      })),
    });
  } catch (err) {
    next(err);
  }
});

const ajusteSchema = z.object({
  idProducto: z.coerce.number().int().positive("Seleccione un producto"),
  cantidad: z.coerce
    .number({ invalid_type_error: "Indique cuánto sumar o restar" })
    .refine((v) => Number.isInteger(v), {
      message: "La cantidad debe ser un número entero",
    })
    .refine((v) => v !== 0, { message: "El ajuste no puede ser 0" }),
  motivo: z.preprocess(
    (v) => (v == null ? "" : v),
    z.string().trim().min(1, "El motivo es obligatorio").max(300)
  ),
});

async function generarNumeroAjuste(tx) {
  const year = new Date().getFullYear();
  const prefix = `AJ-${year}-`;
  const [row] = await tx
    .select({ numero: ferMovimientoInventario.numeroDocumento })
    .from(ferMovimientoInventario)
    .where(sql`${ferMovimientoInventario.numeroDocumento} LIKE ${prefix + "%"}`)
    .orderBy(desc(ferMovimientoInventario.numeroDocumento))
    .limit(1);

  let secuencia = 1;
  if (row?.numero) {
    const parsed = Number.parseInt(row.numero.slice(prefix.length), 10);
    if (Number.isFinite(parsed)) secuencia = parsed + 1;
  }
  return `${prefix}${String(secuencia).padStart(5, "0")}`;
}

router.post("/ajustes", requireRole(...ROLES_INVENTARIO), async (req, res, next) => {
  try {
    const parsed = ajusteSchema.safeParse(req.body);
    if (!parsed.success) {
      const fields = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key && !fields[key]) fields[key] = issue.message;
      }
      return res.status(400).json({
        success: false,
        message: parsed.error.issues[0]?.message || "Revise el ajuste",
        fields,
      });
    }

    const idUsuario = req.user?.sub;
    if (!idUsuario) {
      return res.status(401).json({ success: false, message: "Sesión no válida" });
    }

    const { idProducto, cantidad, motivo } = parsed.data;

    const data = await db.transaction(async (tx) => {
      const [producto] = await tx
        .select()
        .from(ferProducto)
        .where(eq(ferProducto.id, idProducto))
        .limit(1);

      if (!producto || producto.estado !== "A") {
        return { error: { status: 400, message: "Seleccione un producto activo" } };
      }

      let [inventario] = await tx
        .select()
        .from(ferInventario)
        .where(eq(ferInventario.idProducto, idProducto))
        .limit(1);

      if (!inventario) {
        [inventario] = await tx
          .insert(ferInventario)
          .values({
            idProducto,
            existenciaActual: "0",
            cantidadReservada: "0",
            version: 0,
          })
          .returning();
      }

      const anterior = toNumber(inventario.existenciaActual);
      const nueva = anterior + cantidad;
      if (nueva < 0) {
        return {
          error: {
            status: 400,
            message:
              "El ajuste dejaría la existencia en negativo. No se registró.",
            fields: {
              cantidad:
                "El ajuste dejaría la existencia en negativo",
            },
          },
        };
      }
      if (toNumber(inventario.cantidadReservada) > nueva) {
        return {
          error: {
            status: 400,
            message: "La existencia no puede quedar debajo de lo reservado",
          },
        };
      }

      await tx
        .update(ferInventario)
        .set({
          existenciaActual: String(nueva),
          fechaUltimoMovimiento: sql`CURRENT_TIMESTAMP`,
          version: inventario.version + 1,
        })
        .where(eq(ferInventario.id, inventario.id));

      const numero = await generarNumeroAjuste(tx);
      await tx.insert(ferMovimientoInventario).values({
        idInventario: inventario.id,
        idUsuario,
        tipoMovimiento: "AJUSTE",
        cantidad: String(Math.abs(cantidad)),
        existenciaAnterior: String(anterior),
        existenciaNueva: String(nueva),
        moduloOrigen: "INVENTARIO",
        idRegistroOrigen: producto.id,
        numeroDocumento: numero,
        motivo,
      });

      const minimo = toNumber(producto.existenciaMinima);
      return {
        existencia: nueva,
        minimo,
        alerta: nueva <= minimo,
        numeroDocumento: numero,
        cantidad,
      };
    });

    if (data.error) {
      return res.status(data.error.status).json({
        success: false,
        message: data.error.message,
        fields: data.error.fields,
      });
    }

    res.status(201).json({
      success: true,
      data,
      message: data.alerta
        ? "Ajuste registrado. El producto quedó en alerta de existencia mínima."
        : "Ajuste registrado correctamente",
    });
  } catch (err) {
    next(err);
  }
});

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
          cantidad:
            r.tipoMovimiento === "AJUSTE" &&
            toNumber(r.existenciaNueva) < toNumber(r.existenciaAnterior)
              ? -toNumber(r.cantidad)
              : toNumber(r.cantidad),
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
