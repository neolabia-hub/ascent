import { randomInt } from 'node:crypto';

const LOWER = 'abcdefghjkmnpqrstuvwxyz'; // sin i/l/o (legibilidad al dictar)
const UPPER = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const DIGITS = '23456789';
const SYMBOLS = '#$%*+';

function pick(alphabet: string): string {
  return alphabet[randomInt(alphabet.length)] as string;
}

/**
 * CONTRASENA DE UNA PERSONA NUEVA = SU CEDULA, SIN NADA MAS (2026-10-01, pedido del cliente).
 *
 * Era cedula + cinco caracteres ("1045876321#Kwp7") y habia que mandarsela a cada persona una por
 * una. La cedula cada quien se la sabe: basta decirle «tu clave es tu cedula». Solo para quien se
 * CREA —a mano o por archivo—; a los que ya existen no se les toca nada.
 *
 * El precio, aceptado por el cliente: quien conozca la cedula de alguien puede entrar antes que el.
 * Lo contienen `mustChangePassword` (el primer ingreso exige una propia, que si pasa la politica) y
 * el limite de intentos. No pasa la politica (10+, mayuscula...) y no tiene que hacerlo: la politica
 * se exige a la clave que ELIGE la persona, no a esta, que es de un solo uso.
 */
export function generateInitialPassword(documentNumber: string): string {
  return documentNumber.trim();
}

/**
 * CONTRASENA AL RESTABLECER: cedula + caracteres al azar.
 * Formato: `<documento><simbolo><Mayuscula><minuscula><minuscula><digito>` -> "1045876321#Kwp7".
 *
 * Restablecer es para alguien que YA existe y perdio su clave; si volviera a ser la cedula, cualquiera
 * que la sepa podria pedir un restablecimiento y entrar el primero. Cumple la politica incluso con
 * documentos cortos y es dictable por telefono (sin i/l/o/0/1). Se entrega UNA vez; solo se guarda
 * el hash argon2.
 */
export function generateResetPassword(documentNumber: string): string {
  const suffix = pick(SYMBOLS) + pick(UPPER) + pick(LOWER) + pick(LOWER) + pick(DIGITS);
  return `${documentNumber}${suffix}`;
}
