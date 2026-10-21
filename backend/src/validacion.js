import { z } from "zod";

export const MENSAJE_CONTRASENA =
  "La contraseña debe tener al menos 8 caracteres, una mayúscula, un número y un carácter especial";

export const contrasenaSchema = z
  .string()
  .min(1, "La contraseña es obligatoria")
  .refine(
    (valor) =>
      valor.length >= 8 &&
      /[A-Z]/.test(valor) &&
      /\d/.test(valor) &&
      /[^A-Za-z0-9]/.test(valor),
    { message: MENSAJE_CONTRASENA }
  );

const letrasNombre = /^[\p{L}]+(?:\s+[\p{L}]+)*$/u;
const mensajeNombre = "El nombre solo puede incluir letras";

export function esquemaNombrePersona(max) {
  return z
    .string()
    .trim()
    .min(1, "El nombre es obligatorio")
    .max(max, `El nombre no puede tener más de ${max} caracteres`)
    .regex(letrasNombre, mensajeNombre);
}

export const nombrePersonaSchema = esquemaNombrePersona(120);

export const personaContactoSchema = z.preprocess(
  (v) => (v == null || String(v).trim() === "" ? undefined : v),
  z
    .string()
    .trim()
    .max(180, "El nombre no puede tener más de 180 caracteres")
    .optional()
    .refine((val) => val == null || letrasNombre.test(val), {
      message: mensajeNombre,
    })
);

export const nitSchema = z
  .string()
  .trim()
  .min(1, "El NIT es obligatorio")
  .max(20, "El NIT no puede tener más de 20 caracteres")
  .regex(
    /^[A-Za-z0-9]+(?:-?[A-Za-z0-9]+)*$/,
    "El NIT solo puede incluir letras, números y un guion"
  );

export const telefonoOpcionalSchema = z.preprocess(
  (v) => (v == null || v === "" ? undefined : v),
  z
    .string()
    .trim()
    .max(30)
    .optional()
    .superRefine((val, ctx) => {
      if (val == null || val === "") return;
      const digitos = val.replace(/[^\d]/g, "");
      if (digitos.length !== 8 || !/^[\d\s-]+$/.test(val)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "El teléfono debe tener 8 dígitos",
        });
      }
    })
);

export const correoOpcionalSchema = z
  .string()
  .trim()
  .max(254)
  .optional()
  .superRefine((val, ctx) => {
    if (val == null || val === "") return;
    if (!z.string().email().safeParse(val).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Correo inválido",
      });
    }
  })
  .transform((v) => (v == null || v === "" ? undefined : v.toLowerCase()));

export function montoPositivo(mensajeObligatorio, mensajeFormato) {
  return z.coerce
    .number({ invalid_type_error: mensajeObligatorio })
    .refine((v) => v > 0, { message: mensajeFormato })
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, {
      message: "Use como máximo 2 decimales",
    });
}

export function enteroNoNegativo(mensajeObligatorio) {
  return z.coerce
    .number({ invalid_type_error: mensajeObligatorio })
    .refine((v) => Number.isInteger(v) && v >= 0, {
      message: "Debe ser un número entero igual o mayor a 0",
    });
}

export function enteroPositivo(mensajeObligatorio) {
  return z.coerce
    .number({ invalid_type_error: mensajeObligatorio })
    .refine((v) => Number.isInteger(v) && v > 0, {
      message: "La cantidad debe ser un número entero mayor a 0",
    });
}
