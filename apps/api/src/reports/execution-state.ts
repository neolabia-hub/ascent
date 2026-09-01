export type EstadoEjecucion =
  | 'ESPERANDO'
  | 'SIN_EMPEZAR'
  | 'EN_CURSO'
  | 'REPROBADA'
  | 'TERMINADA'
  | 'ATRASADA';

export interface EntradaDeEstado {
  /** La obligacion vencio (`assignments.status === 'OVERDUE'`). */
  overdue: boolean;
  /**
   * En que va su inscripcion, o `null` si no tiene ninguna.
   *
   * `WITHDRAWN` y `EXPIRED` estan en la lista porque existen en la base de datos, y las dos caen
   * en el mismo sitio que no tener inscripcion: una retirada se deshizo y una caducada murio sin
   * resultado. Ninguna de las dos es algo que la persona haya hecho. Omitirlas del tipo obligaria
   * a filtrarlas antes de llamar aqui, y a acordarse de hacerlo cada vez.
   */
  enrollmentStatus: 'ENROLLED' | 'IN_PROGRESS' | 'COMPLETED' | 'PASSED' | 'FAILED' | 'WITHDRAWN' | 'EXPIRED' | null;
  /** Convocatoria de autoservicio abierta: puede entrar por su cuenta aunque no este inscrito. */
  puedeAutoinscribirse: boolean;
}

/**
 * COMO VA UNA PERSONA CON UNA FORMACION, para quien administra (Decision #117).
 *
 * ─── POR QUE NO SIRVE EL ESTADO DEL APRENDIZ ───
 *
 * El aprendiz ya tiene su resolutor (`pending-state.ts`) y no vale aqui, aunque se parezcan: aquel
 * responde *"¿que hago yo hoy?"* y por eso solo conoce lo pendiente. Este responde *"¿como va la
 * ejecucion?"* y necesita ver tambien lo TERMINADO y lo REPROBADO, que para el aprendiz ya no
 * existe. Unificarlos obligaria a que uno de los dos hablara de estados que no le sirven.
 *
 * ─── EL ORDEN DE LAS PREGUNTAS ES LA DECISION ───
 *
 * Se mira primero el RESULTADO y despues el plazo, y no al reves:
 *
 *   1. ¿Ya la aprobo?      -> TERMINADA. Una formacion aprobada el mes pasado no esta "atrasada"
 *                             porque su fecha limite haya pasado; esta hecha.
 *   2. ¿La reprobo?        -> REPROBADA. Es el estado que hay que mirar: hay que reprogramarla, y
 *                             mezclarla con "sin empezar" la esconde entre las que solo faltan.
 *   3. ¿Puede empezarla?   -> Si NO, ESPERANDO: la empresa no la ha convocado y no es culpa suya.
 *   4. ¿Se paso la fecha?  -> ATRASADA.
 *   5. ¿La empezo?         -> EN_CURSO. Si no, SIN_EMPEZAR.
 *
 * El punto 3 es el que mas importa para quien administra: separa "no la ha hecho" de "no ha
 * podido hacerla". Sin esa separacion, un renglon del plan sin convocar se lee como gente
 * incumplida, y lo que hay que hacer no es perseguir a nadie sino programar la jornada.
 */
export function resolverEstadoEjecucion(entrada: EntradaDeEstado): EstadoEjecucion {
  const { enrollmentStatus, overdue, puedeAutoinscribirse } = entrada;

  if (enrollmentStatus === 'COMPLETED' || enrollmentStatus === 'PASSED') return 'TERMINADA';
  if (enrollmentStatus === 'FAILED') return 'REPROBADA';

  // Retirada o caducada cuentan como si no hubiera: ninguna es un resultado.
  const sinInscripcion =
    enrollmentStatus === null || enrollmentStatus === 'WITHDRAWN' || enrollmentStatus === 'EXPIRED';

  // Sin inscripcion viva y sin autoservicio no hay puerta: la persona no puede hacer nada.
  if (sinInscripcion && !puedeAutoinscribirse) return 'ESPERANDO';

  if (overdue) return 'ATRASADA';
  if (enrollmentStatus === 'IN_PROGRESS') return 'EN_CURSO';
  return 'SIN_EMPEZAR';
}

export interface ResumenEjecucion {
  total: number;
  terminadas: number;
  enCurso: number;
  sinEmpezar: number;
  atrasadas: number;
  reprobadas: number;
  esperando: number;
  /**
   * AVANCE = terminadas / total. Es el numero que se ensena arriba.
   *
   * Las que ESPERAN convocatoria SI cuentan en el denominador, y esa es la decision dificil.
   * Sacarlas daria un porcentaje mas bonito —y falso—: si de cien personas cincuenta no han sido
   * convocadas, el avance real de esa formacion es 50%, no 100% sobre las cincuenta que si. El
   * numero tiene que doler cuando la ejecucion va mal; si no, no sirve para decidir nada.
   */
  avancePct: number;
}

export function resumirEjecucion(estados: EstadoEjecucion[]): ResumenEjecucion {
  const cuenta = (estado: EstadoEjecucion) => estados.filter((valor) => valor === estado).length;
  const terminadas = cuenta('TERMINADA');

  return {
    total: estados.length,
    terminadas,
    enCurso: cuenta('EN_CURSO'),
    sinEmpezar: cuenta('SIN_EMPEZAR'),
    atrasadas: cuenta('ATRASADA'),
    reprobadas: cuenta('REPROBADA'),
    esperando: cuenta('ESPERANDO'),
    avancePct: estados.length === 0 ? 0 : Math.round((terminadas / estados.length) * 100),
  };
}
