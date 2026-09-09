import { randomInt } from 'node:crypto';

/**
 * EL CODIGO DE LA SESION: el QR que se proyecta en el salon (mecanismo 2, CLAUDE.md §3.7).
 *
 * ─── QUE PROBLEMA RESUELVE, Y CUAL NO ───
 *
 * La lista del instructor ya funciona y seguira siendo la via normal. Esto sirve para la jornada de
 * cuarenta personas donde pasar lista a mano cuesta diez minutos del tiempo de todos, y para dejar
 * un sello de tiempo por persona en vez de una marca que puso alguien despues, de memoria.
 *
 * Lo que NO resuelve: que alguien escanee por otro. Eso lo resuelve el tercer mecanismo —la firma—
 * y ninguno de los dos sustituye a un instructor que mira la sala.
 *
 * ─── POR QUE ROTA, Y POR QUE 90 SEGUNDOS ───
 *
 * Un codigo fijo se fotografia y se manda al grupo de WhatsApp: quien esta en su casa marca
 * asistencia a una jornada a la que no fue, y eso convierte la evidencia en lo contrario de
 * evidencia. Rotando, la foto sirve minuto y medio.
 *
 * 90 segundos es el punto entre las dos formas de que esto no se use: mas corto y la gente del
 * fondo no alcanza a escanear antes de que cambie —y a la tercera vez que falla, el instructor
 * vuelve al papel—; mas largo y la foto compartida vuelve a valer para toda la sesion.
 *
 * ─── Y POR QUE SE PUEDE TECLEAR ───
 *
 * Seis caracteres de un alfabeto SIN parecidos: nada de 0/O, 1/I/L, 5/S, 8/B. Alguien siempre tiene
 * la camara rota, el telefono sin datos o una funda que no deja enfocar, y el que no puede escanear
 * es exactamente el que se queda sin constar. Un codigo que no se puede dictar en voz alta obliga a
 * volver al papel para una persona, que es volver al papel.
 */
export const ALFABETO = 'ACDEFGHJKMNPQRTUVWXY234679';

/** Cuanto vive cada codigo. Ver arriba: es la distancia entre "no me dio tiempo" y "lo fotografio". */
export const SEGUNDOS_DE_VIDA = 90;

export function generarCodigo(sorteo: (max: number) => number = (max) => randomInt(max)): string {
  let codigo = '';
  for (let i = 0; i < 6; i += 1) codigo += ALFABETO[sorteo(ALFABETO.length)];
  return codigo;
}

/** Cuando caduca un codigo emitido ahora. */
export function caducaEn(ahora: Date, segundos = SEGUNDOS_DE_VIDA): Date {
  return new Date(ahora.getTime() + segundos * 1000);
}

/**
 * ¿Sigue sirviendo este codigo?
 *
 * Sin fecha de caducidad NO sirve, y es deliberado: una jornada vieja puede tener un `session_code`
 * de una version anterior o de una prueba, y darlo por bueno para siempre es justo lo que la
 * rotacion viene a evitar.
 */
export function vigente(caducaAt: Date | null | undefined, ahora: Date): boolean {
  return Boolean(caducaAt) && (caducaAt as Date).getTime() > ahora.getTime();
}

/**
 * Lo que se teclea se normaliza antes de comparar: la gente escribe en minusculas, con espacios y
 * con guiones. Rechazar "a3f-9kq" cuando el codigo es "A3F9KQ" es rechazar a alguien por como
 * escribe, no por lo que sabe.
 */
export function normalizar(codigo: string): string {
  return codigo.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Los segundos que le quedan, para pintar la cuenta atras sin que la pantalla adivine. */
export function segundosRestantes(caducaAt: Date | null | undefined, ahora: Date): number {
  if (!caducaAt) return 0;
  return Math.max(0, Math.ceil((caducaAt.getTime() - ahora.getTime()) / 1000));
}
