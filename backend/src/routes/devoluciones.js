import { Router } from "express";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  ferDetalleDevolucion,
  ferDetallePedido,
  ferDetalleVenta,
  ferDevolucion,
  ferInventario,
  ferMovimientoInventario,
  ferPago,
  ferPedido,
  ferProducto,
  ferVenta,
} from "../db/schema.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { registrarAuditoria } from "../auditoria.js";

const router = Router();

router.use(requireAuth, requireRole("ADMINISTRADOR", "SUPERVISOR"));

const MENSAJE_PAGO =
  "Termine el pago de la venta antes de registrar la devolución.";

const devolucionSchema = z.object({
  motivo: z
    .string()
    .trim()
    .min(1, "Escriba por qué se devuelven los productos")
    .max(300, "El motivo no puede tener más de 300 caracteres"),
  lineas: z
    .array(
      z.object({
        idDetalleVenta: z.coerce
          .number({ invalid_type_error: "Seleccione un producto" })
          .int()
          .positive("Seleccione un producto"),
        cantidad: z.coerce
          .number({ invalid_type_error: "Indique cuántas unidades devuelve" })
          .refine((valor) => Number.isInteger(valor) && valor > 0, {
            message: "La cantidad debe ser un número entero mayor a 0",
          }),
      })
    )
    .min(1, "Indique cuántas unidades devuelve"),
});

function toNumber(value) {
  if (value == null || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round3(n) {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

function roundMoney(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function textoCantidad(n) {
  const valor = toNumber(n);
  return Number.isInteger(valor) ? String(valor) : String(valor);
}

function httpError(status, message, fields) {
  const error = new Error(message);
  error.status = status;
  error.fields = fields;
  return error;
}

async function generarNumero(tx) {
  const year = new Date().getFullYear();
  const prefix = `DEV-${year}-`;
  const [row] = await tx
    .select({ numero: ferDevolucion.numeroDevolucion })
    .from(ferDevolucion)
    .where(sql`${ferDevolucion.numeroDevolucion} LIKE ${prefix + "%"}`)
    .orderBy(desc(ferDevolucion.numeroDevolucion))
    .limit(1);

  let secuencia = 1;
  if (row?.numero) {
    const parsed = Number.parseInt(row.numero.slice(prefix.length), 10);
    if (Number.isFinite(parsed)) secuencia = parsed + 1;
  }
  return `${prefix}${String(secuencia).padStart(5, "0")}`;
}

router.post("/:id/devoluciones", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: "Venta no válida" });
    }

    const parsed = devolucionSchema.safeParse(req.body);
    if (!parsed.success) {
      const fields = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (key && !fields[key]) fields[key] = issue.message;
      }
      return res.status(400).json({
        success: false,
        message: parsed.error.issues[0]?.message || "Revise la devolución",
        fields,
      });
    }

    const idUsuario = Number(req.user?.sub);
    if (!idUsuario) {
      return res.status(401).json({ success: false, message: "Sesión no válida" });
    }

    const { motivo, lineas } = parsed.data;
    const data = await db.transaction(async (tx) => {
      const [venta] = await tx
        .select({
          id: ferVenta.id,
          numeroFactura: ferVenta.numeroFactura,
          estado: ferVenta.estado,
          porcentajeDescuento: ferPedido.porcentajeDescuento,
        })
        .from(ferVenta)
        .innerJoin(ferPedido, eq(ferVenta.idPedido, ferPedido.id))
        .where(eq(ferVenta.id, id))
        .limit(1)
        .for("update");

      if (!venta) throw httpError(404, "Venta no encontrada");
      if (venta.estado !== "FINALIZADA") {
        throw httpError(400, "Solo se puede devolver productos de una venta finalizada");
      }

      const detalles = await tx
        .select({
          id: ferDetalleVenta.id,
          cantidad: ferDetalleVenta.cantidad,
          precioUnitario: ferDetalleVenta.precioUnitario,
          idProducto: ferDetallePedido.idProducto,
          codigo: ferProducto.codigo,
          nombre: ferProducto.nombre,
        })
        .from(ferDetalleVenta)
        .innerJoin(
          ferDetallePedido,
          eq(ferDetalleVenta.idDetallePedido, ferDetallePedido.id)
        )
        .innerJoin(ferProducto, eq(ferDetallePedido.idProducto, ferProducto.id))
        .where(eq(ferDetalleVenta.idVenta, id))
        .orderBy(asc(ferDetalleVenta.id));

      const subtotal = roundMoney(
        detalles.reduce(
          (sum, linea) => sum + toNumber(linea.cantidad) * toNumber(linea.precioUnitario),
          0
        )
      );
      const descuento = roundMoney(subtotal * (toNumber(venta.porcentajeDescuento) / 100));
      const total = roundMoney(subtotal - descuento);

      const [pago] = await tx
        .select({
          pagado: sql`COALESCE(SUM(${ferPago.monto}), 0)::float`,
        })
        .from(ferPago)
        .where(and(eq(ferPago.idVenta, id), eq(ferPago.estado, "REGISTRADO")));
      const saldo = roundMoney(total - toNumber(pago?.pagado));
      if (saldo > 0) throw httpError(400, MENSAJE_PAGO);

      const devueltas = await tx.execute(sql`
        SELECT d."DDE_ID_DETALLE_VENTA" AS id,
               COALESCE(SUM(d."DDE_CANTIDAD"), 0)::float AS cantidad
        FROM "FER_DETALLE_DEVOLUCION" d
        INNER JOIN "FER_DEVOLUCION" h
          ON h."DEV_ID_DEVOLUCION" = d."DDE_ID_DEVOLUCION"
        WHERE h."DEV_ID_VENTA" = ${id}
        GROUP BY d."DDE_ID_DETALLE_VENTA"
      `);
      const yaDevuelto = new Map(
        devueltas.rows.map((row) => [Number(row.id), toNumber(row.cantidad)])
      );
      const porId = new Map(detalles.map((detalle) => [Number(detalle.id), detalle]));
      const quedaAlgo = detalles.some((detalle) => {
        const disponible = round3(
          toNumber(detalle.cantidad) - (yaDevuelto.get(Number(detalle.id)) || 0)
        );
        return disponible > 0;
      });
      if (!quedaAlgo) {
        throw httpError(400, "Ya se devolvió todo lo vendido en esta venta.");
      }

      const fields = {};
      const vistos = new Set();
      const aceptadas = [];
      lineas.forEach((linea) => {
        if (vistos.has(linea.idDetalleVenta)) {
          fields[`linea_${linea.idDetalleVenta}`] = "No puede repetir el mismo producto";
          return;
        }
        vistos.add(linea.idDetalleVenta);
        const detalle = porId.get(Number(linea.idDetalleVenta));
        if (!detalle) {
          fields[`linea_${linea.idDetalleVenta}`] = "El producto no pertenece a la venta";
          return;
        }
        const vendidas = toNumber(detalle.cantidad);
        const disponible = round3(vendidas - (yaDevuelto.get(Number(detalle.id)) || 0));
        if (linea.cantidad > disponible + 0.0001) {
          fields[`linea_${linea.idDetalleVenta}`] =
            disponible <= 0
              ? `${detalle.nombre} ya se devolvió por completo.`
              : `No puede devolver más de lo vendido. De ${detalle.nombre} puede devolver ${textoCantidad(disponible)}.`;
          return;
        }
        aceptadas.push({ ...linea, detalle });
      });
      if (Object.keys(fields).length) {
        throw httpError(400, "No puede devolver más de lo vendido", fields);
      }

      const numero = await generarNumero(tx);
      const [documento] = await tx
        .insert(ferDevolucion)
        .values({
          idVenta: id,
          idUsuario,
          numeroDevolucion: numero,
          motivo,
        })
        .returning();

      const movimientos = [];
      const ordenadas = [...aceptadas].sort(
        (a, b) => a.detalle.idProducto - b.detalle.idProducto
      );
      for (const linea of ordenadas) {
        const [inventario] = await tx
          .select()
          .from(ferInventario)
          .where(eq(ferInventario.idProducto, linea.detalle.idProducto))
          .limit(1)
          .for("update");
        if (!inventario) {
          throw httpError(400, `No hay inventario de ${linea.detalle.nombre}`);
        }

        const anterior = toNumber(inventario.existenciaActual);
        const nueva = round3(anterior + linea.cantidad);
        await tx
          .update(ferInventario)
          .set({
            existenciaActual: String(nueva),
            fechaUltimoMovimiento: sql`CURRENT_TIMESTAMP`,
            version: inventario.version + 1,
          })
          .where(eq(ferInventario.id, inventario.id));

        await tx.insert(ferDetalleDevolucion).values({
          idDevolucion: documento.id,
          idDetalleVenta: linea.idDetalleVenta,
          cantidad: String(linea.cantidad),
        });

        await tx.insert(ferMovimientoInventario).values({
          idInventario: inventario.id,
          idUsuario,
          tipoMovimiento: "DEVOLUCION",
          cantidad: String(linea.cantidad),
          existenciaAnterior: String(anterior),
          existenciaNueva: String(nueva),
          moduloOrigen: "VENTAS",
          idRegistroOrigen: venta.id,
          numeroDocumento: venta.numeroFactura,
          motivo,
        });

        movimientos.push({
          idProducto: linea.detalle.idProducto,
          codigo: linea.detalle.codigo,
          nombre: linea.detalle.nombre,
          cantidad: linea.cantidad,
          existenciaAnterior: anterior,
          existenciaNueva: nueva,
          tipo: "DEVOLUCION",
          idVenta: venta.id,
          numeroVenta: venta.numeroFactura,
        });
      }

      return {
        id: documento.id,
        numeroDevolucion: numero,
        idVenta: venta.id,
        numeroVenta: venta.numeroFactura,
        motivo,
        lineas: ordenadas.map((linea) => ({
          idDetalleVenta: linea.idDetalleVenta,
          codigo: linea.detalle.codigo,
          nombre: linea.detalle.nombre,
          cantidad: linea.cantidad,
        })),
        movimientos,
      };
    });

    await registrarAuditoria({
      idUsuario,
      modulo: "VENTAS",
      accion: "DEVOLUCION",
      entidad: "FER_DEVOLUCION",
      idRegistro: data.id,
      registro: data.numeroDevolucion,
      valorNuevo: {
        venta: data.numeroVenta,
        motivo: data.motivo,
        lineas: data.lineas,
      },
      mensaje: `Devolución ${data.numeroDevolucion} de la venta ${data.numeroVenta}`,
    });

    res.status(201).json({
      success: true,
      message: "Devolución registrada. La venta no cambió y la existencia ya subió.",
      data,
    });
  } catch (error) {
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message,
        fields: error.fields,
      });
    }
    next(error);
  }
});

export default router;
