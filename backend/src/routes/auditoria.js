import { Router } from "express";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { ferAuditoria, ferUsuario } from "../db/schema.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { ACCIONES_AUDITORIA, MODULOS_AUDITORIA, listaAcciones, nombreAccion, nombreModulo } from "../auditoria.js";

const router = Router();

router.use(requireAuth, requireRole("ADMINISTRADOR"));

const MENSAJE_BLOQUEO = "La auditoría no se puede modificar ni eliminar";

function nombrePersona(row) {
  return [row.primerNombre, row.primerApellido].filter(Boolean).join(" ");
}

function registroVisible(row) {
  const nuevo = row.valorNuevo;
  if (nuevo && typeof nuevo === "object" && nuevo.registro) {
    return String(nuevo.registro);
  }
  const texto = String(row.mensaje || "");
  const documento = texto.match(/[A-Z]{2,4}-\d{4}-\d{5}/);
  if (documento) return documento[0];
  const codigo = texto.match(/\b[A-Z]{2,5}-\d{3,}\b/);
  if (codigo) return codigo[0];
  return String(row.idRegistro);
}

function fechaValida(valor) {
  return typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor);
}

router.get("/", async (req, res, next) => {
  try {
    const condiciones = [];
    const idUsuario = Number(req.query.usuario);
    if (Number.isInteger(idUsuario) && idUsuario > 0) {
      condiciones.push(eq(ferAuditoria.idUsuario, idUsuario));
    }
    const modulo = String(req.query.modulo || "").trim();
    if (modulo) condiciones.push(eq(ferAuditoria.modulo, modulo));
    const accion = String(req.query.accion || "").trim();
    if (accion && ACCIONES_AUDITORIA[accion]) {
      condiciones.push(eq(ferAuditoria.accion, accion));
    }
    if (fechaValida(req.query.desde)) {
      condiciones.push(
        sql`(${ferAuditoria.fechaEvento} AT TIME ZONE 'America/Guatemala')::date >= ${req.query.desde}`
      );
    }
    if (fechaValida(req.query.hasta)) {
      condiciones.push(
        sql`(${ferAuditoria.fechaEvento} AT TIME ZONE 'America/Guatemala')::date <= ${req.query.hasta}`
      );
    }

    const base = db
      .select({
        id: ferAuditoria.id,
        fecha: ferAuditoria.fechaEvento,
        modulo: ferAuditoria.modulo,
        accion: ferAuditoria.accion,
        entidad: ferAuditoria.entidad,
        idRegistro: ferAuditoria.idRegistro,
        valorAnterior: ferAuditoria.valorAnterior,
        valorNuevo: ferAuditoria.valorNuevo,
        resultado: ferAuditoria.resultado,
        mensaje: ferAuditoria.mensaje,
        nombreUsuario: ferUsuario.nombreUsuario,
        primerNombre: ferUsuario.primerNombre,
        primerApellido: ferUsuario.primerApellido,
      })
      .from(ferAuditoria)
      .innerJoin(ferUsuario, eq(ferAuditoria.idUsuario, ferUsuario.id));

    const rows = await (condiciones.length ? base.where(and(...condiciones)) : base)
      .orderBy(desc(ferAuditoria.id))
      .limit(300);

    const usuarios = await db
      .select({
        id: ferUsuario.id,
        nombreUsuario: ferUsuario.nombreUsuario,
        primerNombre: ferUsuario.primerNombre,
        primerApellido: ferUsuario.primerApellido,
      })
      .from(ferUsuario)
      .orderBy(asc(ferUsuario.nombreUsuario));

    res.json({
      success: true,
      data: rows.map((row) => ({
        id: row.id,
        fecha: row.fecha,
        nombreUsuario: row.nombreUsuario,
        nombre: nombrePersona(row),
        modulo: row.modulo,
        moduloNombre: nombreModulo(row.modulo),
        accion: row.accion,
        accionNombre: nombreAccion(row.accion),
        registro: registroVisible(row),
        resultado: row.resultado,
        mensaje: row.mensaje,
        valorAnterior: row.valorAnterior,
        valorNuevo: row.valorNuevo,
      })),
      filtros: {
        usuarios: usuarios.map((usuario) => ({
          id: usuario.id,
          nombreUsuario: usuario.nombreUsuario,
          nombre: nombrePersona(usuario),
        })),
        modulos: MODULOS_AUDITORIA.map(([id, nombre]) => ({ id, nombre })),
        acciones: listaAcciones(),
      },
    });
  } catch (error) {
    next(error);
  }
});

function bloquear(_req, res) {
  res.status(400).json({ success: false, message: MENSAJE_BLOQUEO });
}

router.patch("/", bloquear);
router.delete("/", bloquear);
router.put("/:id", bloquear);
router.patch("/:id", bloquear);
router.delete("/:id", bloquear);

export default router;
