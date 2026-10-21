import { Router } from "express";
import { eq, sql, asc } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  ferProveedor,
  ferDireccion,
  ferDepartamento,
  ferMunicipio,
} from "../db/schema.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  correoOpcionalSchema,
  esquemaNombrePersona,
  nitSchema,
  personaContactoSchema,
  telefonoOpcionalSchema,
} from "../validacion.js";

const router = Router();

const ROLES_LECTURA = ["ADMINISTRADOR", "SUPERVISOR"];
const ROLES_ESCRITURA = ["ADMINISTRADOR"];

router.use(requireAuth);

const optionalText = (max) =>
  z.preprocess(
    (v) => (v == null || v === "" ? undefined : v),
    z.string().trim().max(max).optional()
  );

const createSchema = z.object({
  nombre: esquemaNombrePersona(180),
  nit: nitSchema,
  telefono: telefonoOpcionalSchema,
  correo: correoOpcionalSchema,
  personaContacto: personaContactoSchema,
});

function fieldErrorsFromZod(error) {
  const fields = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (key === "nombre") {
      fields.nombre = issue.message;
    } else if (key && !fields[key]) {
      fields[key] = issue.message;
    }
  }
  return fields;
}

function normalizarNit(nit) {
  return nit.trim().toUpperCase().replace(/\s+/g, "");
}

async function ensureMunicipioDefault() {
  const [existente] = await db
    .select()
    .from(ferMunicipio)
    .where(eq(ferMunicipio.codigo, "0101"))
    .limit(1);

  if (existente) return existente.id;

  let [dep] = await db
    .select()
    .from(ferDepartamento)
    .where(eq(ferDepartamento.codigo, "01"))
    .limit(1);

  if (!dep) {
    [dep] = await db
      .insert(ferDepartamento)
      .values({ codigo: "01", nombre: "Guatemala" })
      .returning();
  }

  const [mun] = await db
    .insert(ferMunicipio)
    .values({
      idDepartamento: dep.id,
      codigo: "0101",
      nombre: "Guatemala",
    })
    .returning();

  return mun.id;
}

async function crearDireccionPlaceholder() {
  const idMunicipio = await ensureMunicipioDefault();
  const [dir] = await db
    .insert(ferDireccion)
    .values({
      idMunicipio,
      referencia: "Proveedor — sin dirección detallada",
    })
    .returning();
  return dir.id;
}

function mapProveedor(row) {
  return {
    id: row.id,
    nombre: row.razonSocial,
    nit: row.nit,
    telefono: row.telefono || null,
    correo: row.correo || null,
    personaContacto: row.nombreContacto || null,
    estado: row.estado,
    activo: row.estado === "A",
    fechaCreacion: row.fechaCreacion,
  };
}

router.get("/", requireRole(...ROLES_LECTURA), async (_req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(ferProveedor)
      .orderBy(asc(ferProveedor.razonSocial));

    res.json({ success: true, data: rows.map(mapProveedor) });
  } catch (err) {
    next(err);
  }
});

/** Solo activos (para futuras compras). */
router.get("/activos", requireRole(...ROLES_LECTURA), async (_req, res, next) => {
  try {
    const rows = await db
      .select()
      .from(ferProveedor)
      .where(eq(ferProveedor.estado, "A"))
      .orderBy(asc(ferProveedor.razonSocial));

    res.json({ success: true, data: rows.map(mapProveedor) });
  } catch (err) {
    next(err);
  }
});

router.post("/", requireRole(...ROLES_ESCRITURA), async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Revise los campos obligatorios",
        fields: fieldErrorsFromZod(parsed.error),
      });
    }

    const { nombre, nit, telefono, correo, personaContacto } = parsed.data;
    const nitNorm = normalizarNit(nit);

    const [nitExiste] = await db
      .select({ id: ferProveedor.id })
      .from(ferProveedor)
      .where(
        sql`UPPER(REPLACE(${ferProveedor.nit}, ' ', '')) = ${nitNorm}`
      )
      .limit(1);

    if (nitExiste) {
      return res.status(409).json({
        success: false,
        code: "NIT_DUPLICADO",
        message: "Ya existe un proveedor con ese NIT",
        fields: { nit: "Ya existe un proveedor con ese NIT" },
      });
    }

    const idDireccion = await crearDireccionPlaceholder();

    const [creado] = await db
      .insert(ferProveedor)
      .values({
        idDireccion,
        nit: nitNorm.slice(0, 20),
        razonSocial: nombre.slice(0, 180),
        nombreContacto: personaContacto?.slice(0, 180) ?? null,
        correo: (correo ?? "").slice(0, 254),
        telefono: (telefono ?? "").slice(0, 30),
        estado: "A",
      })
      .returning();

    res.status(201).json({
      success: true,
      data: mapProveedor(creado),
      message: "Proveedor registrado correctamente",
    });
  } catch (err) {
    if (err?.code === "23505") {
      return res.status(409).json({
        success: false,
        code: "NIT_DUPLICADO",
        message: "Ya existe un proveedor con ese NIT",
        fields: { nit: "Ya existe un proveedor con ese NIT" },
      });
    }
    next(err);
  }
});

router.patch(
  "/:id/desactivar",
  requireRole(...ROLES_ESCRITURA),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
          success: false,
          message: "Identificador de proveedor inválido",
        });
      }

      const [proveedor] = await db
        .select()
        .from(ferProveedor)
        .where(eq(ferProveedor.id, id))
        .limit(1);

      if (!proveedor) {
        return res.status(404).json({
          success: false,
          message: "Proveedor no encontrado",
        });
      }

      if (proveedor.estado === "I") {
        return res.json({
          success: true,
          data: mapProveedor(proveedor),
          message: "El proveedor ya estaba inactivo",
        });
      }

      const [actualizado] = await db
        .update(ferProveedor)
        .set({ estado: "I" })
        .where(eq(ferProveedor.id, id))
        .returning();

      res.json({
        success: true,
        data: mapProveedor(actualizado),
        message: "Proveedor desactivado correctamente",
      });
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  "/:id/activar",
  requireRole(...ROLES_ESCRITURA),
  async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
          success: false,
          message: "Identificador de proveedor inválido",
        });
      }

      const [proveedor] = await db
        .select()
        .from(ferProveedor)
        .where(eq(ferProveedor.id, id))
        .limit(1);

      if (!proveedor) {
        return res.status(404).json({
          success: false,
          message: "Proveedor no encontrado",
        });
      }

      const [actualizado] = await db
        .update(ferProveedor)
        .set({ estado: "A" })
        .where(eq(ferProveedor.id, id))
        .returning();

      res.json({
        success: true,
        data: mapProveedor(actualizado),
        message: "Proveedor activado correctamente",
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
