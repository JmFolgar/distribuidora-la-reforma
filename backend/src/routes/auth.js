import { Router } from "express";
import bcrypt from "bcryptjs";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { ferUsuario, ferRol, ferUsuarioRol } from "../db/schema.js";
import { requireAuth, signToken } from "../middleware/auth.js";
import { registrarAuditoria } from "../auditoria.js";

const router = Router();

const loginSchema = z.object({
  correo: z.string().email("Correo inválido").max(254),
  contrasena: z.string().min(1, "La contraseña es obligatoria"),
});

function nombreCompleto(usuario) {
  return [
    usuario.primerNombre,
    usuario.segundoNombre,
    usuario.primerApellido,
    usuario.segundoApellido,
  ]
    .filter(Boolean)
    .join(" ");
}

async function rolesActivosDeUsuario(idUsuario) {
  const rows = await db
    .select({
      id: ferRol.id,
      nombre: ferRol.nombre,
      descripcion: ferRol.descripcion,
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

  return rows;
}

router.post("/login", async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        success: false,
        message: "Correo o contraseña incorrectos",
      });
    }

    const correo = parsed.data.correo.trim().toLowerCase();
    const contrasena = parsed.data.contrasena;

    const [usuario] = await db
      .select()
      .from(ferUsuario)
      .where(sql`LOWER(${ferUsuario.correo}) = ${correo}`)
      .limit(1);

    if (!usuario) {
      return res.status(401).json({
        success: false,
        message: "Correo o contraseña incorrectos",
      });
    }

    const claveOk = await bcrypt.compare(contrasena, usuario.claveHash);
    if (!claveOk) {
      return res.status(401).json({
        success: false,
        message: "Correo o contraseña incorrectos",
      });
    }

    if (usuario.estado !== "A") {
      return res.status(403).json({
        success: false,
        code: "USUARIO_INACTIVO",
        message:
          "Su usuario no está activo. Contacte al administrador para recuperar el acceso.",
      });
    }

    const roles = await rolesActivosDeUsuario(usuario.id);
    if (roles.length === 0) {
      return res.status(403).json({
        success: false,
        message:
          "Su usuario no tiene un rol asignado. Contacte al administrador.",
      });
    }

    await db
      .update(ferUsuario)
      .set({
        ultimoAcceso: new Date(),
        intentosFallidos: 0,
        fechaModificacion: new Date(),
      })
      .where(eq(ferUsuario.id, usuario.id));

    const rolPrincipal = roles[0];
    const token = signToken({
      sub: usuario.id,
      correo: usuario.correo,
      nombreUsuario: usuario.nombreUsuario,
      rol: rolPrincipal.nombre,
      roles: roles.map((r) => r.nombre),
    });

    await registrarAuditoria({
      idUsuario: usuario.id,
      modulo: "SESION",
      accion: "LOGIN",
      entidad: "FER_USUARIO",
      idRegistro: usuario.id,
      registro: usuario.nombreUsuario,
      mensaje: `${usuario.nombreUsuario} inició sesión`,
    });

    return res.json({
      success: true,
      data: {
        token,
        usuario: {
          id: usuario.id,
          correo: usuario.correo,
          nombreUsuario: usuario.nombreUsuario,
          nombreCompleto: nombreCompleto(usuario),
          rol: rolPrincipal.nombre,
          roles: roles.map((r) => r.nombre),
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post("/logout", requireAuth, (_req, res) => {
  // JWT sin lista de revocación: el cliente debe descartar el token.
  res.json({
    success: true,
    message: "Sesión cerrada correctamente",
  });
});

router.get("/me", requireAuth, async (req, res, next) => {
  try {
    const [usuario] = await db
      .select()
      .from(ferUsuario)
      .where(eq(ferUsuario.id, req.user.sub))
      .limit(1);

    if (!usuario || usuario.estado !== "A") {
      return res.status(401).json({
        success: false,
        message: "Sesión no válida. Inicie sesión nuevamente.",
      });
    }

    const roles = await rolesActivosDeUsuario(usuario.id);

    return res.json({
      success: true,
      data: {
        id: usuario.id,
        correo: usuario.correo,
        nombreUsuario: usuario.nombreUsuario,
        nombreCompleto: nombreCompleto(usuario),
        rol: roles[0]?.nombre ?? null,
        roles: roles.map((r) => r.nombre),
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
