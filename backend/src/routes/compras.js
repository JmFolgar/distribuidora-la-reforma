import { Router } from "express";
import { eq, asc, desc, sql, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  ferCompra,
  ferDetalleCompra,
  ferProveedor,
  ferProducto,
} from "../db/schema.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = Router();

router.use(requireAuth);

const ROLES_COMPRAS = ["ADMINISTRADOR", "SUPERVISOR"];

/** En BD la orden recién creada es CREADA; en negocio se muestra como PENDIENTE. */
const ESTADO_DB_PENDIENTE = "CREADA";

const lineaSchema = z.object({
  idProducto: z.coerce
    .number({ invalid_type_error: "Seleccione un producto" })
    .int()
    .positive("Seleccione un producto"),
  cantidad: z.coerce
    .number({ invalid_type_error: "La cantidad es obligatoria" })
    .refine((v) => v > 0, { message: "La cantidad debe ser mayor a 0" }),
  costoUnitario: z.coerce
    .number({ invalid_type_error: "El costo es obligatorio" })
    .refine((v) => v > 0, { message: "El costo debe ser mayor a 0" }),
});

const compraBodySchema = z.object({
  idProveedor: z.coerce
    .number({ invalid_type_error: "Seleccione un proveedor" })
    .int()
    .positive("Seleccione un proveedor"),
  observacion: z.string().trim().max(500).optional(),
  lineas: z
    .array(lineaSchema)
    .min(1, "Debe agregar al menos un producto a la compra"),
});

function toNumber(value) {
  if (value == null || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function roundMoney(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function mapEstadoFromDb(estadoDb) {
  if (estadoDb === ESTADO_DB_PENDIENTE) return "PENDIENTE";
  return estadoDb;
}

function calcularTotalLineas(lineas) {
  return roundMoney(
    lineas.reduce(
      (sum, l) => sum + toNumber(l.cantidad) * toNumber(l.costoUnitario),
      0
    )
  );
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

async function generarNumeroCompra(tx) {
  const year = new Date().getFullYear();
  const prefix = `OC-${year}-`;
  const [row] = await tx
    .select({ numero: ferCompra.numeroCompra })
    .from(ferCompra)
    .where(sql`${ferCompra.numeroCompra} LIKE ${prefix + "%"}`)
    .orderBy(desc(ferCompra.numeroCompra))
    .limit(1);

  let secuencia = 1;
  if (row?.numero) {
    const part = row.numero.slice(prefix.length);
    const parsed = Number.parseInt(part, 10);
    if (Number.isFinite(parsed)) secuencia = parsed + 1;
  }

  return `${prefix}${String(secuencia).padStart(5, "0")}`;
}

async function validarProveedorActivo(tx, idProveedor) {
  const [proveedor] = await tx
    .select()
    .from(ferProveedor)
    .where(eq(ferProveedor.id, idProveedor))
    .limit(1);

  if (!proveedor) {
    return { ok: false, status: 404, message: "Proveedor no encontrado" };
  }
  if (proveedor.estado !== "A") {
    return {
      ok: false,
      status: 400,
      message: "El proveedor seleccionado no está activo",
      fields: { idProveedor: "Seleccione un proveedor activo" },
    };
  }
  return { ok: true, proveedor };
}

async function validarProductosActivos(tx, lineas) {
  const ids = [...new Set(lineas.map((l) => l.idProducto))];
  if (ids.length !== lineas.length) {
    return {
      ok: false,
      status: 400,
      message: "No puede repetir el mismo producto en la misma compra",
      fields: { lineas: "Cada producto solo puede aparecer una vez" },
    };
  }

  const productos = await tx
    .select({ id: ferProducto.id, estado: ferProducto.estado })
    .from(ferProducto)
    .where(inArray(ferProducto.id, ids));

  if (productos.length !== ids.length) {
    return {
      ok: false,
      status: 400,
      message: "Uno o más productos no existen",
      fields: { lineas: "Revise los productos seleccionados" },
    };
  }

  const inactivo = productos.find((p) => p.estado !== "A");
  if (inactivo) {
    return {
      ok: false,
      status: 400,
      message: "Solo puede incluir productos activos",
      fields: { lineas: "Hay productos inactivos en el detalle" },
    };
  }

  return { ok: true };
}

function mapLineaDb(row, extra = {}) {
  const cantidad = toNumber(row.cantidad);
  const costoUnitario = toNumber(row.costoUnitario);
  return {
    id: row.id,
    idProducto: row.idProducto,
    cantidad,
    costoUnitario,
    subtotal: roundMoney(cantidad * costoUnitario),
    ...extra,
  };
}

async function cargarDetalleCompra(idCompra) {
  const rows = await db
    .select({
      id: ferDetalleCompra.id,
      idProducto: ferDetalleCompra.idProducto,
      cantidad: ferDetalleCompra.cantidad,
      costoUnitario: ferDetalleCompra.costoUnitario,
      codigo: ferProducto.codigo,
      nombre: ferProducto.nombre,
    })
    .from(ferDetalleCompra)
    .innerJoin(ferProducto, eq(ferDetalleCompra.idProducto, ferProducto.id))
    .where(eq(ferDetalleCompra.idCompra, idCompra))
    .orderBy(asc(ferDetalleCompra.id));

  return rows.map((r) =>
    mapLineaDb(r, { codigoProducto: r.codigo, nombreProducto: r.nombre })
  );
}

async function mapCompraCompleta(compraRow, proveedorNombre) {
  const lineas = await cargarDetalleCompra(compraRow.id);
  const total = calcularTotalLineas(lineas);
  return {
    id: compraRow.id,
    idProveedor: compraRow.idProveedor,
    proveedorNombre,
    numeroCompra: compraRow.numeroCompra,
    fechaCompra: compraRow.fechaCompra,
    estado: mapEstadoFromDb(compraRow.estado),
    estadoDb: compraRow.estado,
    observacion: compraRow.observacion,
    lineas,
    total,
    editable: compraRow.estado === ESTADO_DB_PENDIENTE,
  };
}

router.get("/", requireRole(...ROLES_COMPRAS), async (_req, res, next) => {
  try {
    const compras = await db
      .select({
        id: ferCompra.id,
        idProveedor: ferCompra.idProveedor,
        numeroCompra: ferCompra.numeroCompra,
        fechaCompra: ferCompra.fechaCompra,
        estado: ferCompra.estado,
        observacion: ferCompra.observacion,
        proveedorNombre: ferProveedor.razonSocial,
      })
      .from(ferCompra)
      .innerJoin(ferProveedor, eq(ferCompra.idProveedor, ferProveedor.id))
      .orderBy(desc(ferCompra.fechaCompra));

    const data = await Promise.all(
      compras.map(async (c) => {
        const lineas = await cargarDetalleCompra(c.id);
        return {
          id: c.id,
          idProveedor: c.idProveedor,
          proveedorNombre: c.proveedorNombre,
          numeroCompra: c.numeroCompra,
          fechaCompra: c.fechaCompra,
          estado: mapEstadoFromDb(c.estado),
          total: calcularTotalLineas(lineas),
          editable: c.estado === ESTADO_DB_PENDIENTE,
        };
      })
    );

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.get("/:id", requireRole(...ROLES_COMPRAS), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "Identificador de compra inválido",
      });
    }

    const [row] = await db
      .select({
        compra: ferCompra,
        proveedorNombre: ferProveedor.razonSocial,
      })
      .from(ferCompra)
      .innerJoin(ferProveedor, eq(ferCompra.idProveedor, ferProveedor.id))
      .where(eq(ferCompra.id, id))
      .limit(1);

    if (!row) {
      return res.status(404).json({
        success: false,
        message: "Compra no encontrada",
      });
    }

    const data = await mapCompraCompleta(row.compra, row.proveedorNombre);
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.post("/", requireRole(...ROLES_COMPRAS), async (req, res, next) => {
  try {
    const parsed = compraBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Revise el proveedor y el detalle de productos",
        fields: fieldErrorsFromZod(parsed.error),
      });
    }

    const { idProveedor, observacion, lineas } = parsed.data;

    const resultado = await db.transaction(async (tx) => {
      const prov = await validarProveedorActivo(tx, idProveedor);
      if (!prov.ok) {
        return { error: prov };
      }

      const prod = await validarProductosActivos(tx, lineas);
      if (!prod.ok) {
        return { error: prod };
      }

      const numeroCompra = await generarNumeroCompra(tx);

      const [compra] = await tx
        .insert(ferCompra)
        .values({
          idProveedor,
          numeroCompra,
          estado: ESTADO_DB_PENDIENTE,
          observacion: observacion || null,
        })
        .returning();

      const detalleValues = lineas.map((l) => ({
        idCompra: compra.id,
        idProducto: l.idProducto,
        cantidad: String(l.cantidad),
        costoUnitario: String(roundMoney(l.costoUnitario)),
        porcentajeDescuento: "0",
        porcentajeImpuesto: "0",
      }));

      await tx.insert(ferDetalleCompra).values(detalleValues);

      return { compra, proveedorNombre: prov.proveedor.razonSocial };
    });

    if (resultado.error) {
      const e = resultado.error;
      return res.status(e.status).json({
        success: false,
        message: e.message,
        fields: e.fields,
      });
    }

    const data = await mapCompraCompleta(
      resultado.compra,
      resultado.proveedorNombre
    );

    res.status(201).json({
      success: true,
      data,
      message: "Orden de compra registrada correctamente",
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", requireRole(...ROLES_COMPRAS), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "Identificador de compra inválido",
      });
    }

    const parsed = compraBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Revise el proveedor y el detalle de productos",
        fields: fieldErrorsFromZod(parsed.error),
      });
    }

    const { idProveedor, observacion, lineas } = parsed.data;

    const resultado = await db.transaction(async (tx) => {
      const [compra] = await tx
        .select()
        .from(ferCompra)
        .where(eq(ferCompra.id, id))
        .limit(1);

      if (!compra) {
        return { error: { status: 404, message: "Compra no encontrada" } };
      }

      if (compra.estado !== ESTADO_DB_PENDIENTE) {
        return {
          error: {
            status: 409,
            message: "Solo se puede modificar una compra en estado PENDIENTE",
          },
        };
      }

      const prov = await validarProveedorActivo(tx, idProveedor);
      if (!prov.ok) {
        return { error: prov };
      }

      const prod = await validarProductosActivos(tx, lineas);
      if (!prod.ok) {
        return { error: prod };
      }

      await tx
        .delete(ferDetalleCompra)
        .where(eq(ferDetalleCompra.idCompra, id));

      const detalleValues = lineas.map((l) => ({
        idCompra: id,
        idProducto: l.idProducto,
        cantidad: String(l.cantidad),
        costoUnitario: String(roundMoney(l.costoUnitario)),
        porcentajeDescuento: "0",
        porcentajeImpuesto: "0",
      }));

      await tx.insert(ferDetalleCompra).values(detalleValues);

      const [actualizada] = await tx
        .update(ferCompra)
        .set({
          idProveedor,
          observacion: observacion || null,
        })
        .where(eq(ferCompra.id, id))
        .returning();

      return {
        compra: actualizada,
        proveedorNombre: prov.proveedor.razonSocial,
      };
    });

    if (resultado.error) {
      const e = resultado.error;
      return res.status(e.status).json({
        success: false,
        message: e.message,
        fields: e.fields,
      });
    }

    const data = await mapCompraCompleta(
      resultado.compra,
      resultado.proveedorNombre
    );

    res.json({
      success: true,
      data,
      message: "Orden de compra actualizada correctamente",
    });
  } catch (err) {
    next(err);
  }
});

export default router;
