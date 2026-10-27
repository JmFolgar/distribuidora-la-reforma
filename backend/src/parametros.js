import { eq } from "drizzle-orm";
import { db } from "./db/index.js";
import { ferParametro, ferUsuario } from "./db/schema.js";

export const CODIGO_DESCUENTO_SIN_APROBACION = "PORCENTAJE_MAXIMO_SIN_APROBACION";
const VALOR_INICIAL = 10;

export function porcentajeValido(valor) {
  if (valor == null || String(valor).trim() === "") {
    return { ok: false, message: "Escriba el porcentaje" };
  }
  const numero = Number(valor);
  if (!Number.isFinite(numero)) {
    return { ok: false, message: "El porcentaje debe ser un número" };
  }
  if (numero < 0 || numero > 100) {
    return { ok: false, message: "El porcentaje debe estar entre 0 y 100" };
  }
  if (Math.abs(numero * 100 - Math.round(numero * 100)) > 1e-6) {
    return { ok: false, message: "El porcentaje puede tener como máximo 2 decimales" };
  }
  return { ok: true, porcentaje: Math.round(numero * 100) / 100 };
}

export async function leerPorcentajeSinAprobacion(executor = db) {
  const [row] = await executor
    .select({ id: ferParametro.id, valor: ferParametro.valor })
    .from(ferParametro)
    .where(eq(ferParametro.codigo, CODIGO_DESCUENTO_SIN_APROBACION))
    .limit(1);
  if (!row) return null;
  const numero = Number(row.valor);
  return {
    id: row.id,
    porcentaje: Number.isFinite(numero) ? numero : VALOR_INICIAL,
  };
}

export async function asegurarPorcentajeSinAprobacion(executor = db) {
  const actual = await leerPorcentajeSinAprobacion(executor);
  if (actual) return actual;

  const [usuario] = await executor.select({ id: ferUsuario.id }).from(ferUsuario).limit(1);
  if (!usuario) return { id: null, porcentaje: VALOR_INICIAL };

  const [row] = await executor
    .insert(ferParametro)
    .values({
      idUsuarioModifica: usuario.id,
      codigo: CODIGO_DESCUENTO_SIN_APROBACION,
      nombre: "Descuento sin aprobación",
      valor: String(VALOR_INICIAL),
      tipoDato: "NUMERO",
      descripcion:
        "Porcentaje máximo de descuento que un pedido nuevo puede llevar sin aprobación.",
      estado: "A",
    })
    .returning({ id: ferParametro.id });

  return { id: row.id, porcentaje: VALOR_INICIAL };
}
