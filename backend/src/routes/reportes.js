import { Router } from "express";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  ferCliente,
  ferCompra,
  ferDetalleCompra,
  ferDetalleVenta,
  ferInventario,
  ferMovimientoInventario,
  ferPedido,
  ferProducto,
  ferProveedor,
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

function nombreCliente(row) {
  if (row.tipoPersona === "JURIDICA" && row.razonSocial) return row.razonSocial;
  return nombrePersona(row);
}

function diasDesde(fecha, hoy) {
  const dia = new Date(fecha).toLocaleDateString("en-CA", { timeZone: "America/Guatemala" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return 0;
  const [y1, m1, d1] = dia.split("-").map(Number);
  const [y2, m2, d2] = hoy.split("-").map(Number);
  const ms = Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1);
  return Math.max(0, Math.round(ms / 86400000));
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

router.get("/productos-bajo-minimo", async (_req, res, next) => {
  try {
    const rows = await db
      .select({
        id: ferProducto.id,
        codigo: ferProducto.codigo,
        nombre: ferProducto.nombre,
        existencia: ferInventario.existenciaActual,
        minimo: ferProducto.existenciaMinima,
      })
      .from(ferProducto)
      .leftJoin(ferInventario, eq(ferInventario.idProducto, ferProducto.id))
      .where(
        and(
          eq(ferProducto.estado, "A"),
          sql`COALESCE(${ferInventario.existenciaActual}, 0) <= ${ferProducto.existenciaMinima}`
        )
      )
      .orderBy(asc(ferProducto.codigo));

    const productos = rows.map((row) => {
      const existencia = toNumber(row.existencia);
      const minimo = toNumber(row.minimo);
      const faltante = Math.max(0, Math.round((minimo - existencia) * 1000) / 1000);
      return {
        id: row.id,
        codigo: row.codigo,
        nombre: row.nombre,
        existencia,
        minimo,
        faltante,
      };
    });

    res.json({ success: true, data: { productos } });
  } catch (error) {
    next(error);
  }
});

const ESTADOS_COMPRA = {
  CREADA: "Pendiente",
  PENDIENTE: "Pendiente",
  RECIBIDA: "Recibida",
  CANCELADA: "Cancelada",
};

router.get("/compras", async (req, res, next) => {
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

    const crudo = String(req.query.idProveedor || "").trim();
    let idProveedor = null;
    if (crudo) {
      idProveedor = Number(crudo);
      if (!Number.isInteger(idProveedor) || idProveedor <= 0) {
        return res.status(400).json({
          success: false,
          message: "Seleccione un proveedor",
        });
      }
    }

    const filtros = [
      sql`(${ferCompra.fechaCompra} AT TIME ZONE 'America/Guatemala')::date >= ${desde}`,
      sql`(${ferCompra.fechaCompra} AT TIME ZONE 'America/Guatemala')::date <= ${hasta}`,
    ];
    if (idProveedor) filtros.push(eq(ferCompra.idProveedor, idProveedor));

    const compras = await db
      .select({
        id: ferCompra.id,
        numeroCompra: ferCompra.numeroCompra,
        fecha: ferCompra.fechaCompra,
        estado: ferCompra.estado,
        idProveedor: ferProveedor.id,
        proveedor: ferProveedor.razonSocial,
      })
      .from(ferCompra)
      .innerJoin(ferProveedor, eq(ferCompra.idProveedor, ferProveedor.id))
      .where(and(...filtros))
      .orderBy(asc(ferProveedor.razonSocial), asc(ferCompra.fechaCompra), asc(ferCompra.id));

    const ids = compras.map((compra) => compra.id);
    const lineasPorCompra = new Map();
    if (ids.length) {
      const lineas = await db
        .select({
          idCompra: ferDetalleCompra.idCompra,
          cantidad: ferDetalleCompra.cantidad,
          costoUnitario: ferDetalleCompra.costoUnitario,
        })
        .from(ferDetalleCompra)
        .where(inArray(ferDetalleCompra.idCompra, ids));
      for (const linea of lineas) {
        const lista = lineasPorCompra.get(linea.idCompra) || [];
        lista.push(linea);
        lineasPorCompra.set(linea.idCompra, lista);
      }
    }

    const grupos = [];
    for (const compra of compras) {
      const lineas = lineasPorCompra.get(compra.id) || [];
      const total = roundMoney(
        lineas.reduce((sum, linea) => sum + toNumber(linea.cantidad) * toNumber(linea.costoUnitario), 0)
      );
      let grupo = grupos.find((item) => item.idProveedor === compra.idProveedor);
      if (!grupo) {
        grupo = {
          idProveedor: compra.idProveedor,
          proveedor: compra.proveedor,
          total: 0,
          compras: [],
        };
        grupos.push(grupo);
      }
      grupo.compras.push({
        id: compra.id,
        numeroCompra: compra.numeroCompra,
        fecha: compra.fecha,
        estado: ESTADOS_COMPRA[compra.estado] || compra.estado,
        total,
      });
      grupo.total = roundMoney(grupo.total + total);
    }

    const totalGeneral = roundMoney(grupos.reduce((sum, grupo) => sum + grupo.total, 0));

    res.json({
      success: true,
      data: {
        desde,
        hasta,
        idProveedor,
        totalGeneral,
        grupos,
      },
    });
  } catch (error) {
    next(error);
  }
});

router.get("/saldos", async (req, res, next) => {
  try {
    const crudo = String(req.query.idCliente || "").trim();
    let idCliente = null;
    if (crudo) {
      idCliente = Number(crudo);
      if (!Number.isInteger(idCliente) || idCliente <= 0) {
        return res.status(400).json({
          success: false,
          message: "Seleccione un cliente",
        });
      }
    }

    const filtros = [eq(ferVenta.estado, "FINALIZADA")];
    if (idCliente) filtros.push(eq(ferCliente.id, idCliente));

    const ventas = await db
      .select({
        id: ferVenta.id,
        numeroVenta: ferVenta.numeroFactura,
        fecha: ferVenta.fechaVenta,
        porcentajeDescuento: ferPedido.porcentajeDescuento,
        idCliente: ferCliente.id,
        tipoPersona: ferCliente.tipoPersona,
        razonSocial: ferCliente.razonSocial,
        primerNombre: ferCliente.primerNombre,
        primerApellido: ferCliente.primerApellido,
      })
      .from(ferVenta)
      .innerJoin(ferPedido, eq(ferVenta.idPedido, ferPedido.id))
      .innerJoin(ferCliente, eq(ferPedido.idCliente, ferCliente.id))
      .where(and(...filtros))
      .orderBy(asc(ferVenta.fechaVenta), asc(ferVenta.id));

    const ids = ventas.map((venta) => venta.id);
    const lineasPorVenta = new Map();
    const pagadoPorVenta = new Map();

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

      const pagos = await db.execute(sql`
        SELECT "PAG_ID_VENTA"::int AS id,
               COALESCE(SUM("PAG_MONTO"), 0)::float AS pagado
        FROM "FER_PAGO"
        WHERE "PAG_ESTADO" = 'REGISTRADO'
          AND "PAG_ID_VENTA" IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
        GROUP BY "PAG_ID_VENTA"
      `);
      for (const row of pagos.rows) {
        pagadoPorVenta.set(Number(row.id), toNumber(row.pagado));
      }
    }

    const hoy = fechaHoy();
    const pendientes = [];
    for (const venta of ventas) {
      const lineas = lineasPorVenta.get(venta.id) || [];
      const subtotal = roundMoney(
        lineas.reduce((sum, linea) => sum + toNumber(linea.cantidad) * toNumber(linea.precioUnitario), 0)
      );
      const descuento = roundMoney(subtotal * (toNumber(venta.porcentajeDescuento) / 100));
      const total = roundMoney(subtotal - descuento);
      const pagado = roundMoney(pagadoPorVenta.get(venta.id) || 0);
      const saldo = roundMoney(total - pagado);
      if (saldo <= 0) continue;
      pendientes.push({
        id: venta.id,
        cliente: nombreCliente(venta),
        numeroVenta: venta.numeroVenta,
        fecha: venta.fecha,
        total,
        pagado,
        saldo,
        dias: diasDesde(venta.fecha, hoy),
      });
    }

    pendientes.sort((a, b) => b.dias - a.dias || a.id - b.id);

    res.json({
      success: true,
      data: {
        idCliente,
        ventas: pendientes,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
