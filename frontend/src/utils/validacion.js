export const MENSAJE_CONTRASENA =
  "La contraseña debe tener al menos 8 caracteres, una mayúscula, un número y un carácter especial";

export function contrasenaValida(contrasena) {
  const valor = String(contrasena);
  return (
    valor.length >= 8 &&
    /[A-Z]/.test(valor) &&
    /\d/.test(valor) &&
    /[^A-Za-z0-9]/.test(valor)
  );
}

export function nombrePersonaValido(nombre) {
  return /^[\p{L}]+(?:\s+[\p{L}]+)*$/u.test(String(nombre).trim());
}

export function correoValido(correo) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(correo).trim());
}

export function nitValido(nit) {
  const valor = String(nit).trim();
  return /^[A-Za-z0-9]+(?:-?[A-Za-z0-9]+)*$/.test(valor) && valor.length <= 20;
}

export function telefonoValido(telefono) {
  const digitos = String(telefono).replace(/[^\d]/g, "");
  const limpio = String(telefono).trim();
  return digitos.length === 8 && /^[\d\s-]+$/.test(limpio);
}

export function enteroValido(valor) {
  return /^-?\d+$/.test(String(valor).trim());
}

export function montoValido(valor, { permitirCero = false } = {}) {
  const texto = String(valor).trim();
  if (!/^\d+(\.\d{1,2})?$/.test(texto)) return false;
  const numero = Number(texto);
  return permitirCero ? numero >= 0 : numero > 0;
}
