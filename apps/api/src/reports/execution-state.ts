export type EstadoEjecucion =
  | 'ESPERANDO'
  | 'SIN_EMPEZAR'
  | 'EN_CURSO'
  | 'REPROBADA'
  | 'TERMINADA'
  | 'ATRASADA'
  /** Cerro el periodo sin hacerla (`EXPIRED_NOT_DONE`, Decision #142). Es incumplimiento. */
  | 'NO_REALIZADA'
  /** Alguien la eximio con motivo (`WAIVED`). No es incumplimiento ni cumplimiento. */
  | 'EXIMIDA';

/**
 * OBLIGACIONES QUE YA NO SE LE PIDEN A NADIE, y por tanto no entran en ningun informe (2026-09-04).
 *
 * Retirarse de una audiencia —cambiar de cargo, salir del alcance de un requisito, que se retire el
 * requisito entero— **no** es no haber hecho la formacion: es que ya no se le exige. Cancelar el
 * renglon del plan, igual.
 *
 * Es el mismo argumento que ya estaba escrito para quien deja la empresa ("su obligacion murio con
 * su salida, y dejarlo infla el denominador con gente que no va a formarse"), pero no se habia
 * aplicado al estado de la obligacion. MEDIDO en la base de desarrollo el 2026-09-04: **96.246
 * retiradas** contra 24.477 pendientes vivas, todas contadas como "sin empezar". El avance global
 * salia 224/121.819 = 0,18% cuando lo real es 224/25.164 = 0,89%: cinco veces peor de lo que es.
 *
 * Se exporta para que las consultas filtren por aqui y no por una lista escrita a mano en cada una:
 * son tres, y la que se olvide dara un numero distinto en su pantalla.
 */
export const ESTADOS_RETIRADOS = ['WITHDRAWN_LEFT_AUDIENCE', 'WITHDRAWN_PLAN_ITEM_CANCELLED'] as const;

/**
 * QUE EJECUCION DESCRIBE A CADA RONDA (2026-09-05).
 *
 * ─── EL FALLO QUE OBLIGA A QUE ESTO EXISTA ───
 *
 * Los tres informes cogian la inscripcion MAS RECIENTE de cada persona y la aplicaban a TODAS sus
 * filas. Con una formacion que no se repite da igual —una ronda, una inscripcion—; en cuanto se
 * repite es falso, y `resolverEstadoEjecucion` pregunta primero por el resultado, asi que **quien
 * completo la ronda 1 salia con la ronda 2 tambien como TERMINADA**.
 *
 * MEDIDO el 2026-09-05 con `asistencia.mjs`: 5 obligaciones, 3 pendientes de verdad, y el informe
 * decia 4 terminadas. En produccion es la reinduccion de 796 personas figurando hecha el 2 de enero
 * de cada ano, y nadie reclama un numero que le favorece.
 *
 * Es el hermano del fallo del 2026-09-04 —el informe contando lo retirado como "sin empezar"— pero
 * al reves: aquel inflaba el incumplimiento y este infla el CUMPLIMIENTO.
 *
 * ─── POR QUE NO HAY QUE ADIVINAR NADA ───
 *
 * El enlace existe en las dos direcciones desde el Sprint 3 (Decision #2: ejecucion y obligacion se
 * ENLAZAN, no se fusionan): `assignments.completed_enrollment_id` apunta a la que la cerro, y
 * `enrollments.assignment_id` a la que se venia a satisfacer. Se usan los dos y no se supone nada:
 * una inscripcion sin obligacion **no colorea ninguna fila**, que es lo correcto — es una ejecucion
 * que no responde por ese requisito.
 *
 * Vive aqui y se exporta por el mismo motivo que `ESTADOS_RETIRADOS`: son TRES informes, y el que
 * se olvide de aplicarlo dara un numero distinto en su pantalla.
 */
export function inscripcionDeCadaRonda<
  A extends { id: string; completedEnrollmentId?: string | null },
  E extends { id: string; assignmentId?: string | null },
>(obligaciones: readonly A[], inscripciones: readonly E[]): Map<string, E> {
  const porObligacion = new Map<string, E>();
  const porId = new Map(inscripciones.map((fila) => [fila.id, fila]));

  // Primero la que la CERRO: es la respuesta directa y no depende de que el enlace de ida exista.
  for (const obligacion of obligaciones) {
    const cerrada = obligacion.completedEnrollmentId ? porId.get(obligacion.completedEnrollmentId) : undefined;
    if (cerrada) porObligacion.set(obligacion.id, cerrada);
  }
  // Y despues la que se abrio PARA ella, que es la que describe lo que esta en curso.
  for (const inscripcion of inscripciones) {
    if (inscripcion.assignmentId && !porObligacion.has(inscripcion.assignmentId)) {
      porObligacion.set(inscripcion.assignmentId, inscripcion);
    }
  }
  return porObligacion;
}

/**
 * COMO SE LLAMA CADA ESTADO POR ESCRITO.
 *
 * Vive aqui porque el servidor tambien tiene que nombrarlos: lo que se exporta a Excel se lee sin
 * la aplicacion delante, y "SIN_EMPEZAR" en una celda no es un informe, es un volcado. La pantalla
 * mantiene los suyos porque ademas les pone color; lo que no puede pasar es que el archivo diga una
 * palabra y la pantalla otra, asi que estos son los mismos textos.
 */
export const ESTADO_LABEL: Record<EstadoEjecucion, string> = {
  TERMINADA: 'Terminada',
  EN_CURSO: 'En curso',
  SIN_EMPEZAR: 'Sin empezar',
  ATRASADA: 'Atrasada',
  REPROBADA: 'Reprobada',
  ESPERANDO: 'Esperando convocatoria',
  NO_REALIZADA: 'No realizada',
  EXIMIDA: 'Eximida',
};

/** Los ocho, para validar lo que llega por query sin repetir la lista. */
export const ESTADOS_EJECUCION = [
  'ESPERANDO',
  'SIN_EMPEZAR',
  'EN_CURSO',
  'REPROBADA',
  'TERMINADA',
  'ATRASADA',
  'NO_REALIZADA',
  'EXIMIDA',
] as const satisfies readonly EstadoEjecucion[];

export interface EntradaDeEstado {
  /** La obligacion vencio (`assignments.status === 'OVERDUE'`). */
  overdue: boolean;
  /**
   * ESTADO DE LA OBLIGACION, para los dos que no se deducen de la inscripcion.
   *
   * `EXPIRED_NOT_DONE` y `WAIVED` son estados TERMINALES escritos por el motor y por quien exime, y
   * no dejan ninguna huella en la inscripcion —quien nunca empezo no tiene inscripcion ninguna—.
   * Sin esto los dos caian en `SIN_EMPEZAR`, que dice justo lo contrario de lo que son: una campana
   * cerrada sin hacer no es "todavia no la ha empezado", y una eximida no es trabajo pendiente.
   *
   * Opcional para no obligar a tocar a quien solo pregunta por el plazo y la inscripcion.
   */
  assignmentStatus?: string | null;
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
  const { enrollmentStatus, overdue, puedeAutoinscribirse, assignmentStatus } = entrada;

  if (enrollmentStatus === 'COMPLETED' || enrollmentStatus === 'PASSED') return 'TERMINADA';
  if (enrollmentStatus === 'FAILED') return 'REPROBADA';

  /*
    LOS DOS FINALES QUE NO VIENEN DE LA INSCRIPCION, y van justo detras del resultado.

    Detras, porque el resultado manda: si alcanzo a aprobarla, esta hecha aunque despues alguien la
    eximiera. Delante de todo lo demas, porque las dos son FINALES —no hay nada que la persona pueda
    hacer ya con esa ronda— y preguntar por el plazo o por la convocatoria de algo cerrado no
    significa nada.
  */
  if (assignmentStatus === 'EXPIRED_NOT_DONE') return 'NO_REALIZADA';
  if (assignmentStatus === 'WAIVED') return 'EXIMIDA';

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
  /** Rondas cerradas sin hacerse. Cuentan como incumplimiento del periodo (Decision #142). */
  noRealizadas: number;
  /** Eximidas con motivo. Ni cumplimiento ni incumplimiento: fuera del porcentaje. */
  eximidas: number;
  /**
   * AVANCE = terminadas / (total - eximidas). Es el numero que se ensena arriba.
   *
   * Las que ESPERAN convocatoria SI cuentan en el denominador, y esa es la decision dificil.
   * Sacarlas daria un porcentaje mas bonito —y falso—: si de cien personas cincuenta no han sido
   * convocadas, el avance real de esa formacion es 50%, no 100% sobre las cincuenta que si. El
   * numero tiene que doler cuando la ejecucion va mal; si no, no sirve para decidir nada.
   *
   * Las EXIMIDAS son la excepcion, y por lo contrario: a esa persona ya nadie le pide la formacion,
   * con un motivo escrito que el auditor puede leer. Dejarlas dentro pondria un techo al indicador
   * —eximir a diez de cien haria imposible pasar del 90%— y castigaria una decision legitima.
   * Las NO REALIZADAS si se quedan: son exactamente el incumplimiento que hay que ver.
   */
  avancePct: number;
}

export function resumirEjecucion(estados: EstadoEjecucion[]): ResumenEjecucion {
  const cuenta = (estado: EstadoEjecucion) => estados.filter((valor) => valor === estado).length;
  const terminadas = cuenta('TERMINADA');
  const eximidas = cuenta('EXIMIDA');
  const exigibles = estados.length - eximidas;

  return {
    total: estados.length,
    terminadas,
    enCurso: cuenta('EN_CURSO'),
    sinEmpezar: cuenta('SIN_EMPEZAR'),
    atrasadas: cuenta('ATRASADA'),
    reprobadas: cuenta('REPROBADA'),
    esperando: cuenta('ESPERANDO'),
    noRealizadas: cuenta('NO_REALIZADA'),
    eximidas,
    avancePct: exigibles <= 0 ? 0 : Math.round((terminadas / exigibles) * 100),
  };
}
