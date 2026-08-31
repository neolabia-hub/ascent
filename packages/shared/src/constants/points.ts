/**
 * LOS PUNTOS que otorga cada cosa (Decision #90).
 *
 * Viven aqui y no en el servidor porque los usan LOS DOS: el servidor para otorgarlos y la
 * pantalla del aprendiz para prometerlos ("+50 al terminarla"). Con la constante duplicada, la
 * promesa y el premio se separan en cuanto alguien cambia un numero, y prometer 50 y dar 30 es
 * peor que no prometer nada.
 */
export const POINTS = {
  LESSON_COMPLETED: 10,
  ACTIVITY_COMPLETED: 50,
  ASSESSMENT_PASSED: 30,
  REVIEW_SESSION: 5,
} as const;
