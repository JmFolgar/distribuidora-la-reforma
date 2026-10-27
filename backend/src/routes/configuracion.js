import { Router } from "express";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { ferParametro } from "../db/schema.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { registrarAuditoria } from "../auditoria.js";
import {
  asegurarPorcentajeSinAprobacion,
  porcentajeValido,
} from "../parametros.js";

const router = Router();

router.use(requireAuth, requireRole("ADMINISTRADOR"));

router.get("/descuento", async (_req, res, next) => {
  try {
    const actual = await asegurarPorcentajeSinAprobacion();
    res.json({ success: true, data: { porcentaje: actual.porcentaje } });
  } catch (error) {
    next(error);
  }
});

router.put("/descuento", async (req, res, next) => {
  try {
    const validado = porcentajeValido(req.body?.porcentaje);
    if (!validado.ok) {
      return res.status(400).json({ success: false, message: validado.message });
    }

    const actual = await asegurarPorcentajeSinAprobacion();
    if (!actual.id) {
      return res.status(500).json({
        success: false,
        message: "No se pudo guardar el porcentaje",
      });
    }

    if (actual.porcentaje === validado.porcentaje) {
      return res.json({ success: true, data: { porcentaje: actual.porcentaje } });
    }

    await db
      .update(ferParametro)
      .set({
        valor: String(validado.porcentaje),
        idUsuarioModifica: Number(req.user.sub),
        fechaModificacion: new Date(),
      })
      .where(eq(ferParametro.id, actual.id));

    await registrarAuditoria({
      idUsuario: Number(req.user.sub),
      modulo: "CONFIGURACION",
      accion: "MODIFICAR",
      entidad: "FER_PARAMETRO",
      idRegistro: actual.id,
      registro: "Descuento sin aprobación",
      valorAnterior: { porcentaje: actual.porcentaje },
      valorNuevo: { porcentaje: validado.porcentaje },
      mensaje: `Cambió el descuento sin aprobación de ${actual.porcentaje}% a ${validado.porcentaje}%`,
    });

    res.json({ success: true, data: { porcentaje: validado.porcentaje } });
  } catch (error) {
    next(error);
  }
});

export default router;
