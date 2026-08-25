import { randomInt } from 'node:crypto';

const LOWER = 'abcdefghjkmnpqrstuvwxyz'; // sin i/l/o (legibilidad al dictar)
const UPPER = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const SYMBOLS = '#$%*+';

function pick(alphabet: string): string {
  return alphabet[randomInt(alphabet.length)] as string;
}

/**
 * Contrasena inicial segura con el patron pedido por el cliente: CEDULA + caracteres.
 * Formato: `<documento><simbolo><Mayuscula><minuscula><minuscula><digito>`
 * Ejemplo: 1045876321#Kw p7 -> "1045876321#Kwp7".
 * Cumple la politica (10+ caracteres, mayuscula, minuscula, numero) incluso con documentos
 * cortos, y es dictable por telefono (alfabeto sin caracteres ambiguos i/l/o/0/1).
 * La entrega es UNA sola vez en la respuesta del endpoint; solo se persiste el hash argon2.
 */
export function generateInitialPassword(documentNumber: string): string {
  const suffix = pick(SYMBOLS) + pick(UPPER) + pick(LOWER) + pick(LOWER) + pick(DIGITS);
  return `${documentNumber}${suffix}`;
}
