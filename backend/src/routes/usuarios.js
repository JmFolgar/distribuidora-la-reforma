import { Router } from "express";
import bcrypt from "bcryptjs";
import { eq, sql, and, asc } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { ferUsuario, ferRol, ferUsuarioRol } from "../db/schema.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { contrasenaSchema, nombrePersonaSchema } from "../validacion.js";
import { registrarAuditoria } from "../auditoria.js";

const router = Router();

router.use(requireAuth, requireRole("ADMINISTRADOR"));

const ROLES_VALIDOS = ["ADMINISTRADOR", "SUPERVISOR", "OPERADOR"];

const createSchema = z.object({
  nombre: nombrePersonaSchema,
  correo: z.string().trim().email("Correo inválido").max(254),
  contrasena: contrasenaSchema,
  rol: z.enum(ROLES_VALIDOS, {
    errorMap: () => ({ message: "Seleccione un rol válido" }),
  }),
});

const updateSchema = z.object({
  nombre: nombrePersonaSchema,
  rol: z.enum(ROLES_VALIDOS, {
    errorMap: () => ({ message: "Seleccione un rol válido" }),
  }),
});

function splitNombre(nombre) {
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { primerNombre: "", primerApellido: "" };
  }
  if (parts.length === 1) {
    return { primerNombre: parts[0], primerApellido: parts[0] };
  }
  return {
    primerNombre: parts[0],
    primerApellido: parts.slice(1).join(" ").slice(0, 60),
  };
}

function nombreCompleto(usuario) {
  if (
    usuario.primerNombre === usuario.primerApellido ||
    !usuario.primerApellido
  ) {
    return usuario.primerNombre;
  }
  return [usuario.primerNombre, usuario.segundoNombre, usuario.primerApellido]
    .filter(Boolean)
    .join(" ");
}

function fieldErrorsFromZod(error) {
  const fields = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (key && !fields[key]) fields[key] = issue.message;
  }
  return fields;
}

async function rolesActivosDeUsuario(idUsuario) {
  return db
    .select({
      id: ferRol.id,
      nombre: ferRol.nombre,
    })
    .from(ferUsuarioRol)
    .innerJoin(ferRol, eq(ferUsuarioRol.idRol, ferRol.id))
    .where(
      and(
        eq(ferUsuarioRol.idUsuario, idUsuario),
        eq(ferUsuarioRol.estado, "A"),
        eq(ferRol.estado, "A"),
        sql`${ferUsuarioRol.fechaRevocacion} IS NULL`
      )
    );
}

async function mapUsuario(usuario) {
  const roles = await rolesActivosDeUsuario(usuario.id);
  return {
    id: usuario.id,
    correo: usuario.correo,
    nombreUsuario: usuario.nombreUsuario,
    nombre: nombreCompleto(usuario),
    primerNombre: usuario.primerNombre,
    primerApellido: usuario.primerApellido,
    estado: usuario.estado,
    activo: usuario.estado === "A",
    rol: roles[0]?.nombre ?? null,
    roles: roles.map((r) => r.nombre),
    fechaCreacion: usuario.fechaCreacion,
    ultimoAcceso: usuario.ultimoAcceso,
  };
}

async function nombreUsuarioDisponible(base) {
  let candidato = base.slice(0, 60).toLowerCase().replace(/[^a-z0-9._-]/g, "");
  if (!candidato) candidato = "usuario";

  for (let i = 0; i < 50; i++) {
    const intento = i === 0 ? candidato : `${candidato}${i}`.slice(0, 60);
    const [existe] = await db
      .select({ id: ferUsuario.id })
      .from(ferUsuario)
      .where(sql`LOWER(${ferUsuario.nombreUsuario}) = ${intento}`)
      .limit(1);
    if (!existe) return intento;
  }

  return `${candidato}${Date.now()}`.slice(0, 60);
}

router.get("/roles", async (_req, res, next) => {
  try {
    const roles = await db
      .select({
        id: ferRol.id,
        nombre: ferRol.nombre,
        descripcion: ferRol.descripcion,
      })
      .from(ferRol)
      .where(eq(ferRol.estado, "A"))
      .orderBy(asc(ferRol.nombre));

    res.json({ success: true, data: roles });
  } catch (err) {
    next(err);
  }
});

router.get("/", async (_req, res, next) => {
  try {
    const usuarios = await db
      .select()
      .from(ferUsuario)
      .orderBy(asc(ferUsuario.id));

    const data = [];
    for (const u of usuarios) {
      data.push(await mapUsuario(u));
    }

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Revise los campos obligatorios",
        fields: fieldErrorsFromZod(parsed.error),
      });
    }

    const { nombre, correo, contrasena, rol } = parsed.data;
    const correoNorm = correo.toLowerCase();
    const { primerNombre, primerApellido } = splitNombre(nombre);

    const [correoExiste] = await db
      .select({ id: ferUsuario.id })
      .from(ferUsuario)
      .where(sql`LOWER(${ferUsuario.correo}) = ${correoNorm}`)
      .limit(1);

    if (correoExiste) {
      return res.status(409).json({
        success: false,
        code: "CORREO_DUPLICADO",
        message: "Ya existe un usuario con ese correo",
        fields: { correo: "Ya existe un usuario con ese correo" },
      });
    }

    const [rolRow] = await db
      .select()
      .from(ferRol)
      .where(and(eq(ferRol.nombre, rol), eq(ferRol.estado, "A")))
      .limit(1);

    if (!rolRow) {
      return res.status(400).json({
        success: false,
        message: "El rol seleccionado no existe",
        fields: { rol: "Seleccione un rol válido" },
      });
    }

    const baseUser =
      correoNorm.split("@")[0] ||
      primerNombre.toLowerCase().replace(/\s+/g, "");
    const nombreUsuario = await nombreUsuarioDisponible(baseUser);
    const claveHash = await bcrypt.hash(contrasena, 10);

    const [creado] = await db
      .insert(ferUsuario)
      .values({
        primerNombre: primerNombre.slice(0, 60),
        primerApellido: primerApellido.slice(0, 60),
        nombreUsuario,
        correo: correoNorm,
        claveHash,
        estado: "A",
      })
      .returning();

    await db.insert(ferUsuarioRol).values({
      idUsuario: creado.id,
      idRol: rolRow.id,
      estado: "A",
    });

    await registrarAuditoria({
      idUsuario: Number(req.user.sub),
      modulo: "USUARIOS",
      accion: "CREAR",
      entidad: "FER_USUARIO",
      idRegistro: creado.id,
      registro: creado.nombreUsuario,
      valorNuevo: { rol, correo: creado.correo },
      mensaje: `Alta del usuario ${creado.nombreUsuario}`,
    });

    res.status(201).json({
      success: true,
      data: await mapUsuario(creado),
      message: "Usuario creado correctamente",
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "Identificador de usuario inválido",
      });
    }

    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Revise los campos obligatorios",
        fields: fieldErrorsFromZod(parsed.error),
      });
    }

    const [usuario] = await db
      .select()
      .from(ferUsuario)
      .where(eq(ferUsuario.id, id))
      .limit(1);

    if (!usuario) {
      return res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
      });
    }

    const { nombre, rol } = parsed.data;
    const { primerNombre, primerApellido } = splitNombre(nombre);

    const [rolRow] = await db
      .select()
      .from(ferRol)
      .where(and(eq(ferRol.nombre, rol), eq(ferRol.estado, "A")))
      .limit(1);

    if (!rolRow) {
      return res.status(400).json({
        success: false,
        message: "El rol seleccionado no existe",
        fields: { rol: "Seleccione un rol válido" },
      });
    }

    const rolesActuales = await rolesActivosDeUsuario(id);
    const rolActual = rolesActuales[0]?.nombre ?? null;

    const [actualizado] = await db
      .update(ferUsuario)
      .set({
        primerNombre: primerNombre.slice(0, 60),
        primerApellido: primerApellido.slice(0, 60),
        fechaModificacion: new Date(),
      })
      .where(eq(ferUsuario.id, id))
      .returning();

    if (rolActual !== rol) {
      await db
        .update(ferUsuarioRol)
        .set({
          estado: "I",
          fechaRevocacion: new Date(),
        })
        .where(
          and(
            eq(ferUsuarioRol.idUsuario, id),
            eq(ferUsuarioRol.estado, "A"),
            sql`${ferUsuarioRol.fechaRevocacion} IS NULL`
          )
        );

      await db.insert(ferUsuarioRol).values({
        idUsuario: id,
        idRol: rolRow.id,
        estado: "A",
      });
    }

    await registrarAuditoria({
      idUsuario: Number(req.user.sub),
      modulo: "USUARIOS",
      accion: "MODIFICAR",
      entidad: "FER_USUARIO",
      idRegistro: id,
      registro: actualizado.nombreUsuario,
      valorAnterior: { rol: rolActual },
      valorNuevo: { rol, nombre: `${primerNombre} ${primerApellido}`.trim() },
      mensaje: `Modificación del usuario ${actualizado.nombreUsuario}`,
    });

    res.json({
      success: true,
      data: await mapUsuario(actualizado),
      message: "Usuario actualizado correctamente",
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id/desactivar", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "Identificador de usuario inválido",
      });
    }

    if (req.user.sub === id) {
      return res.status(400).json({
        success: false,
        message: "No puede desactivar su propio usuario",
      });
    }

    const [usuario] = await db
      .select()
      .from(ferUsuario)
      .where(eq(ferUsuario.id, id))
      .limit(1);

    if (!usuario) {
      return res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
      });
    }

    if (usuario.estado === "I") {
      return res.json({
        success: true,
        data: await mapUsuario(usuario),
        message: "El usuario ya estaba inactivo",
      });
    }

    const [actualizado] = await db
      .update(ferUsuario)
      .set({
        estado: "I",
        fechaModificacion: new Date(),
      })
      .where(eq(ferUsuario.id, id))
      .returning();

    await registrarAuditoria({
      idUsuario: Number(req.user.sub),
      modulo: "USUARIOS",
      accion: "DESACTIVAR",
      entidad: "FER_USUARIO",
      idRegistro: id,
      registro: actualizado.nombreUsuario,
      mensaje: `Se desactivó a ${actualizado.nombreUsuario}`,
    });

    res.json({
      success: true,
      data: await mapUsuario(actualizado),
      message: "Usuario desactivado correctamente",
    });
  } catch (err) {
    next(err);
  }
});

router.patch("/:id/activar", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: "Identificador de usuario inválido",
      });
    }

    const [usuario] = await db
      .select()
      .from(ferUsuario)
      .where(eq(ferUsuario.id, id))
      .limit(1);

    if (!usuario) {
      return res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
      });
    }

    const [actualizado] = await db
      .update(ferUsuario)
      .set({
        estado: "A",
        intentosFallidos: 0,
        fechaBloqueo: null,
        fechaModificacion: new Date(),
      })
      .where(eq(ferUsuario.id, id))
      .returning();

    await registrarAuditoria({
      idUsuario: Number(req.user.sub),
      modulo: "USUARIOS",
      accion: "ACTIVAR",
      entidad: "FER_USUARIO",
      idRegistro: id,
      registro: actualizado.nombreUsuario,
      mensaje: `Se activó a ${actualizado.nombreUsuario}`,
    });

    res.json({
      success: true,
      data: await mapUsuario(actualizado),
      message: "Usuario activado correctamente",
    });
  } catch (err) {
    next(err);
  }
});

export default router;
