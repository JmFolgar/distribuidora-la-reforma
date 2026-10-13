import { Router } from "express";
import { eq, sql, asc, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  ferProducto,
  ferCategoria,
  ferUnidadMedida,
  ferInventario,
} from "../db/schema.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  borrarImagen,
  rechazarImagenInvalida,
  rutaPublica,
  subirImagen,
} from "../imagenProducto.js";
import { enteroNoNegativo, montoPositivo } from "../validacion.js";

const router = Router();

router.use(requireAuth);

const ROLES_LECTURA = ["ADMINISTRADOR", "SUPERVISOR", "OPERADOR"];
const ROLES_ESCRITURA = ["ADMINISTRADOR"];

function fieldErrorsFromZod(error) {
  const fields = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (key && !fields[key]) fields[key] = issue.message;
  }
  return fields;
}

function toNumber(value, fallback = 0) {
  if (value == null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const createSchema = z.object({
  codigo: z.string().trim().min(1, "El código es obligatorio").max(50),
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(150),
  idCategoria: z.coerce
    .number({ invalid_type_error: "Seleccione una categoría" })
    .int()
    .positive("Seleccione una categoría"),
  precioVenta: montoPositivo(
    "El precio de venta es obligatorio",
    "El precio debe ser mayor a 0"
  ),
  existenciaMinima: enteroNoNegativo("La existencia mínima es obligatoria"),
  idUnidadMedida: z.coerce.number().int().positive().optional(),
});

const updateSchema = z.object({
  precioVenta: montoPositivo(
    "El precio de venta es obligatorio",
    "El precio debe ser mayor a 0"
  ),
  existenciaMinima: enteroNoNegativo("La existencia mínima es obligatoria"),
});

async function unidadPorDefecto() {
  const [unidad] = await db
    .select()
    .from(ferUnidadMedida)
    .where(and(eq(ferUnidadMedida.codigo, "UNIDAD"), eq(ferUnidadMedida.estado, "A")))
    .limit(1);

  if (unidad) return unidad;

  const [cualquiera] = await db
    .select()
    .from(ferUnidadMedida)
    .where(eq(ferUnidadMedida.estado, "A"))
    .orderBy(asc(ferUnidadMedida.id))
    .limit(1);

  return cualquiera ?? null;
}

function mapProducto(row) {
  const existencia = toNumber(row.existenciaActual, 0);
  const minimo = toNumber(row.existenciaMinima, 0);
  return {
    id: row.id,
    codigo: row.codigo,
    nombre: row.nombre,
    descripcion: row.descripcion,
    idCategoria: row.idCategoria,
    categoria: row.categoriaNombre,
    idUnidadMedida: row.idUnidadMedida,
    unidadMedida: row.unidadNombre,
    unidadAbreviatura: row.unidadAbreviatura,
    precioCompra: toNumber(row.precioCompra),
    precioVenta: toNumber(row.precioVenta),
    existenciaMinima: minimo,
    existencia,
    stockBajo: existencia < minimo,
    estado: row.estado,
    imagen: row.imagen || null,
    activo: row.estado === "A",
    fechaCreacion: row.fechaCreacion,
    fechaModificacion: row.fechaModificacion,
  };
}

async function productoConInventario(id) {
  const [row] = await db
    .select({
      id: ferProducto.id,
      codigo: ferProducto.codigo,
      nombre: ferProducto.nombre,
      descripcion: ferProducto.descripcion,
      idCategoria: ferProducto.idCategoria,
      categoriaNombre: ferCategoria.nombre,
      idUnidadMedida: ferProducto.idUnidadMedida,
      unidadNombre: ferUnidadMedida.nombre,
      unidadAbreviatura: ferUnidadMedida.abreviatura,
      precioCompra: ferProducto.precioCompra,
      precioVenta: ferProducto.precioVenta,
      existenciaMinima: ferProducto.existenciaMinima,
      estado: ferProducto.estado,
      imagen: ferProducto.imagen,
      fechaCreacion: ferProducto.fechaCreacion,
      fechaModificacion: ferProducto.fechaModificacion,
      existenciaActual: ferInventario.existenciaActual,
    })
    .from(ferProducto)
    .innerJoin(ferCategoria, eq(ferProducto.idCategoria, ferCategoria.id))
    .innerJoin(
      ferUnidadMedida,
      eq(ferProducto.idUnidadMedida, ferUnidadMedida.id)
    )
    .leftJoin(ferInventario, eq(ferInventario.idProducto, ferProducto.id))
    .where(eq(ferProducto.id, id))
    .limit(1);

  return row ? mapProducto(row) : null;
}

router.get(
  "/categorias",
  requireRole(...ROLES_LECTURA),
  async (_req, res, next) => {
    try {
      const data = await db
        .select({
          id: ferCategoria.id,
          nombre: ferCategoria.nombre,
          descripcion: ferCategoria.descripcion,
        })
        .from(ferCategoria)
        .where(eq(ferCategoria.estado, "A"))
        .orderBy(asc(ferCategoria.nombre));

      res.json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
);

async function listarProductosQuery(soloActivos = false) {
  const condiciones = soloActivos ? eq(ferProducto.estado, "A") : undefined;

  let query = db
    .select({
      id: ferProducto.id,
      codigo: ferProducto.codigo,
      nombre: ferProducto.nombre,
      descripcion: ferProducto.descripcion,
      idCategoria: ferProducto.idCategoria,
      categoriaNombre: ferCategoria.nombre,
      idUnidadMedida: ferProducto.idUnidadMedida,
      unidadNombre: ferUnidadMedida.nombre,
      unidadAbreviatura: ferUnidadMedida.abreviatura,
      precioCompra: ferProducto.precioCompra,
      precioVenta: ferProducto.precioVenta,
      existenciaMinima: ferProducto.existenciaMinima,
      estado: ferProducto.estado,
      imagen: ferProducto.imagen,
      fechaCreacion: ferProducto.fechaCreacion,
      fechaModificacion: ferProducto.fechaModificacion,
      existenciaActual: ferInventario.existenciaActual,
    })
    .from(ferProducto)
    .innerJoin(ferCategoria, eq(ferProducto.idCategoria, ferCategoria.id))
    .innerJoin(
      ferUnidadMedida,
      eq(ferProducto.idUnidadMedida, ferUnidadMedida.id)
    )
    .leftJoin(ferInventario, eq(ferInventario.idProducto, ferProducto.id))
    .orderBy(asc(ferProducto.codigo));

  if (condiciones) {
    query = query.where(condiciones);
  }

  return query;
}

router.get(
  "/activos",
  requireRole("ADMINISTRADOR", "SUPERVISOR"),
  async (_req, res, next) => {
    try {
      const rows = await listarProductosQuery(true);
      res.json({ success: true, data: rows.map(mapProducto) });
    } catch (err) {
      next(err);
    }
  }
);

router.get("/", requireRole(...ROLES_LECTURA), async (_req, res, next) => {
  try {
    const rows = await listarProductosQuery(false);
    res.json({ success: true, data: rows.map(mapProducto) });
  } catch (err) {
    next(err);
  }
});

router.post("/", requireRole(...ROLES_ESCRITURA), subirImagen, async (req, res, next) => {
  try {
    if (rechazarImagenInvalida(req, res)) return;
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      if (req.file) borrarImagen(rutaPublica(req.file.filename));
      return res.status(400).json({
        success: false,
        message: "Revise los campos obligatorios",
        fields: fieldErrorsFromZod(parsed.error),
      });
    }

    const {
      codigo,
      nombre,
      idCategoria,
      precioVenta,
      existenciaMinima,
      idUnidadMedida,
    } = parsed.data;
    const codigoNorm = codigo.trim().toUpperCase();

    const [codigoExiste] = await db
      .select({ id: ferProducto.id })
      .from(ferProducto)
      .where(sql`UPPER(${ferProducto.codigo}) = ${codigoNorm}`)
      .limit(1);

    if (codigoExiste) {
      if (req.file) borrarImagen(rutaPublica(req.file.filename));
      return res.status(409).json({
        success: false,
        code: "CODIGO_DUPLICADO",
        message: "Ya existe un producto con ese código",
        fields: { codigo: "Ya existe un producto con ese código" },
      });
    }

    const [categoria] = await db
      .select({ id: ferCategoria.id })
      .from(ferCategoria)
      .where(and(eq(ferCategoria.id, idCategoria), eq(ferCategoria.estado, "A")))
      .limit(1);

    if (!categoria) {
      return res.status(400).json({
        success: false,
        message: "La categoría seleccionada no existe",
        fields: { idCategoria: "Seleccione una categoría válida" },
      });
    }

    let unidadId = idUnidadMedida;
    if (unidadId) {
      const [unidad] = await db
        .select({ id: ferUnidadMedida.id })
        .from(ferUnidadMedida)
        .where(
          and(eq(ferUnidadMedida.id, unidadId), eq(ferUnidadMedida.estado, "A"))
        )
        .limit(1);
      if (!unidad) {
        return res.status(400).json({
          success: false,
          message: "La unidad de medida no existe",
          fields: { idUnidadMedida: "Seleccione una unidad válida" },
        });
      }
    } else {
      const unidad = await unidadPorDefecto();
      if (!unidad) {
        return res.status(500).json({
          success: false,
          message:
            "No hay unidades de medida configuradas. Ejecute el script SQL oficial.",
        });
      }
      unidadId = unidad.id;
    }

    const [creado] = await db
      .insert(ferProducto)
      .values({
        idCategoria,
        idUnidadMedida: unidadId,
        codigo: codigoNorm.slice(0, 50),
        nombre: nombre.slice(0, 150),
        precioCompra: "0",
        precioVenta: precioVenta.toFixed(2),
        porcentajeImpuesto: "0",
        existenciaMinima: existenciaMinima.toFixed(3),
        imagen: req.file ? rutaPublica(req.file.filename) : null,
        estado: "A",
      })
      .returning();

    await db.insert(ferInventario).values({
      idProducto: creado.id,
      existenciaActual: "0",
      cantidadReservada: "0",
      version: 0,
    });

    res.status(201).json({
      success: true,
      data: await productoConInventario(creado.id),
      message: "Producto registrado correctamente",
    });
  } catch (err) {
    if (req.file) borrarImagen(rutaPublica(req.file.filename));
    if (err?.code === "23505") {
      return res.status(409).json({
        success: false,
        code: "CODIGO_DUPLICADO",
        message: "Ya existe un producto con ese código",
        fields: { codigo: "Ya existe un producto con ese código" },
      });
    }
    next(err);
  }
});

async function productoTieneHistorial(id) {
  const result = await db.execute(sql`
    SELECT (
      EXISTS (
        SELECT 1
        FROM "FER_MOVIMIENTO_INVENTARIO" m
        INNER JOIN "FER_INVENTARIO" i
          ON i."INV_ID_INVENTARIO" = m."MOV_ID_INVENTARIO"
        WHERE i."INV_ID_PRODUCTO" = ${id}
      )
      OR EXISTS (
        SELECT 1
        FROM "FER_DETALLE_COMPRA"
        WHERE "DCO_ID_PRODUCTO" = ${id}
      )
      OR EXISTS (
        SELECT 1
        FROM "FER_DETALLE_PEDIDO"
        WHERE "DPE_ID_PRODUCTO" = ${id}
      )
    ) AS tiene
  `);
  return Boolean(result.rows?.[0]?.tiene);
}

router.delete("/:id", requireRole(...ROLES_ESCRITURA), async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "Identificador de producto inválido",
      });
    }

    const [producto] = await db
      .select()
      .from(ferProducto)
      .where(eq(ferProducto.id, id))
      .limit(1);

    if (!producto) {
      return res.status(404).json({
        success: false,
        message: "Producto no encontrado",
      });
    }

    const tieneHistorial = await productoTieneHistorial(id);

    if (tieneHistorial) {
      if (producto.estado !== "I") {
        await db
          .update(ferProducto)
          .set({
            estado: "I",
            fechaModificacion: new Date(),
          })
          .where(eq(ferProducto.id, id));
      }

      const data = await productoConInventario(id);
      return res.json({
        success: true,
        action: "DESACTIVADO",
        data,
        message:
          "No se borró el producto porque tiene movimientos. Pasó a inactivo para conservar su historial y ya no se puede elegir en compras ni pedidos.",
      });
    }

    await db.transaction(async (tx) => {
      await tx.delete(ferInventario).where(eq(ferInventario.idProducto, id));
      await tx.delete(ferProducto).where(eq(ferProducto.id, id));
    });
    borrarImagen(producto.imagen);

    res.json({
      success: true,
      action: "ELIMINADO",
      message: "Producto eliminado porque nunca tuvo movimientos",
    });
  } catch (err) {
    next(err);
  }
});

router.patch(
  "/:id/activar",
  requireRole(...ROLES_ESCRITURA),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
          success: false,
          message: "Identificador de producto inválido",
        });
      }

      const [producto] = await db
        .select()
        .from(ferProducto)
        .where(eq(ferProducto.id, id))
        .limit(1);

      if (!producto) {
        return res.status(404).json({
          success: false,
          message: "Producto no encontrado",
        });
      }

      await db
        .update(ferProducto)
        .set({
          estado: "A",
          fechaModificacion: new Date(),
        })
        .where(eq(ferProducto.id, id));

      res.json({
        success: true,
        data: await productoConInventario(id),
        message: "Producto reactivado. Vuelve a estar disponible en compras y pedidos.",
      });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  "/:id",
  requireRole(...ROLES_ESCRITURA),
  subirImagen,
  async (req, res, next) => {
    try {
      if (rechazarImagenInvalida(req, res)) return;
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
          success: false,
          message: "Identificador de producto inválido",
        });
      }

      // Existencia no se edita a mano (HU5)
      if (
        "existencia" in (req.body || {}) ||
        "existenciaActual" in (req.body || {})
      ) {
        return res.status(400).json({
          success: false,
          message:
            "La existencia no se puede editar manualmente; solo sube con compra o ajuste.",
          fields: {
            existencia: "La existencia no se puede editar manualmente",
          },
        });
      }

      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        if (req.file) borrarImagen(rutaPublica(req.file.filename));
        return res.status(400).json({
          success: false,
          message: "Revise los campos obligatorios",
          fields: fieldErrorsFromZod(parsed.error),
        });
      }

      const [producto] = await db
        .select({ id: ferProducto.id, imagen: ferProducto.imagen })
        .from(ferProducto)
        .where(eq(ferProducto.id, id))
        .limit(1);

      if (!producto) {
        return res.status(404).json({
          success: false,
          message: "Producto no encontrado",
        });
      }

      const { precioVenta, existenciaMinima } = parsed.data;
      const imagenNueva = req.file ? rutaPublica(req.file.filename) : null;

      await db
        .update(ferProducto)
        .set({
          precioVenta: precioVenta.toFixed(2),
          existenciaMinima: existenciaMinima.toFixed(3),
          ...(imagenNueva ? { imagen: imagenNueva } : {}),
          fechaModificacion: new Date(),
        })
        .where(eq(ferProducto.id, id));

      if (imagenNueva && producto.imagen && producto.imagen !== imagenNueva) {
        borrarImagen(producto.imagen);
      }

      res.json({
        success: true,
        data: await productoConInventario(id),
        message: "Producto actualizado correctamente",
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
