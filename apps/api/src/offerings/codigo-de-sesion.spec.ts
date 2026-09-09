import {
  ALFABETO,
  caducaEn,
  generarCodigo,
  normalizar,
  segundosRestantes,
  vigente,
} from './codigo-de-sesion.js';

const AHORA = new Date('2026-09-08T15:00:00Z');

describe('el codigo que se proyecta', () => {
  it('tiene seis caracteres', () => {
    expect(generarCodigo()).toHaveLength(6);
  });

  it('no usa caracteres que se confunden al dictarlo', () => {
    // Alguien siempre tiene la camara rota y hay que leerselo en voz alta. 0/O, 1/I/L, 5/S y 8/B
    // son las cuatro parejas que convierten eso en un "no me deja entrar".
    for (const parecido of ['0', 'O', '1', 'I', 'L', '5', 'S', '8', 'B']) {
      expect(ALFABETO).not.toContain(parecido);
    }
  });

  it('sale de todo el alfabeto y no de una parte', () => {
    // Con un sorteo que devuelve el ultimo indice, el codigo tiene que ser el ultimo caracter.
    const ultimo = ALFABETO[ALFABETO.length - 1];
    expect(generarCodigo((max) => max - 1)).toBe(ultimo?.repeat(6));
  });

  it('dos codigos seguidos no son el mismo', () => {
    // No es una prueba de aleatoriedad: es que no se quede fijo, que es el fallo que se ve.
    const muchos = new Set(Array.from({ length: 50 }, () => generarCodigo()));
    expect(muchos.size).toBeGreaterThan(1);
  });
});

describe('cuanto vive', () => {
  it('caduca a los 90 segundos', () => {
    expect(caducaEn(AHORA).toISOString()).toBe('2026-09-08T15:01:30.000Z');
  });

  it('sirve mientras no ha caducado', () => {
    expect(vigente(caducaEn(AHORA), AHORA)).toBe(true);
    expect(vigente(caducaEn(AHORA), new Date('2026-09-08T15:01:29Z'))).toBe(true);
  });

  it('deja de servir justo al caducar', () => {
    expect(vigente(caducaEn(AHORA), new Date('2026-09-08T15:01:30Z'))).toBe(false);
    expect(vigente(caducaEn(AHORA), new Date('2026-09-08T15:05:00Z'))).toBe(false);
  });

  it('sin fecha de caducidad NO sirve', () => {
    // Una jornada vieja puede arrastrar un codigo de una prueba; darlo por bueno para siempre es
    // exactamente lo que la rotacion viene a evitar.
    expect(vigente(null, AHORA)).toBe(false);
    expect(vigente(undefined, AHORA)).toBe(false);
  });

  it('dice los segundos que le quedan, para la cuenta atras', () => {
    expect(segundosRestantes(caducaEn(AHORA), AHORA)).toBe(90);
    expect(segundosRestantes(caducaEn(AHORA), new Date('2026-09-08T15:01:00Z'))).toBe(30);
    expect(segundosRestantes(caducaEn(AHORA), new Date('2026-09-08T15:02:00Z'))).toBe(0);
    expect(segundosRestantes(null, AHORA)).toBe(0);
  });
});

describe('lo que se teclea', () => {
  it('se acepta en minusculas, con espacios y con guiones', () => {
    // Rechazar "a3f-9kq" cuando el codigo es "A3F9KQ" es rechazar a alguien por como escribe.
    expect(normalizar('a3f-9kq')).toBe('A3F9KQ');
    expect(normalizar(' A3F 9KQ ')).toBe('A3F9KQ');
  });

  it('no inventa nada: lo que no es letra ni numero se cae', () => {
    expect(normalizar('A3F#9KQ!')).toBe('A3F9KQ');
  });
});
