/**
 * DE QUE SOMBRERO ES CADA AVISO.
 *
 * La bandeja es UNA por persona, y desde que quien administra tambien se forma (Decision #65) esa
 * misma bandeja mezcla dos naturalezas que no se parecen en nada:
 *
 *   - "Tienes una formacion nueva"        → es TUYO, como aprendiz. Lo haces tu.
 *   - "Alguien agoto sus intentos"        → es TU TRABAJO, como quien gestiona. Actuas sobre otro.
 *
 * No se separan en dos bandejas —la persona es una sola y tener que mirar en dos sitios es como se
 * pierde un aviso—, pero SI se etiquetan: sin la etiqueta, "Te asignaron una convocatoria" y "Tu
 * formacion del plan 2026" se leen igual y uno de los dos es un encargo de trabajo.
 *
 * Un tipo que no este aqui no se etiqueta. Inventarle una naturaleza a un evento que no se conoce
 * seria peor que no decir nada: el rotulo pasaria a ser una suposicion con aspecto de dato.
 */
export type NotificationKind = 'formacion' | 'gestion';

const KIND_BY_EVENT: Record<string, NotificationKind> = {
  // Lo que TU tienes que hacer.
  ASSIGNMENT_CREATED: 'formacion',
  PLAN_ASSIGNMENTS_CREATED: 'formacion',
  ENROLLED: 'formacion',
  // Lo que tienes que hacer POR OTROS.
  APPROVAL_REQUESTED: 'gestion',
  ATTEMPTS_EXHAUSTED: 'gestion',
  // El instructor no se esta formando: le encargan dictar.
  OFFERING_PUBLISHED: 'gestion',
};

export function notificationKind(eventType: string): NotificationKind | null {
  return KIND_BY_EVENT[eventType] ?? null;
}

export const KIND_LABEL: Record<NotificationKind, string> = {
  formacion: 'Tu formacion',
  gestion: 'Gestion',
};

/**
 * A DONDE LLEVA CADA AVISO al pulsarlo.
 *
 * Un aviso que no lleva a ninguna parte obliga a leerlo, entenderlo y buscar a mano lo que
 * nombra —y con "tienes una formacion nueva" eso son tres pantallas—. Aqui se traduce el par
 * (evento, referencia) en un destino.
 *
 * Devuelve `null` cuando no hay un sitio honesto al que ir. Es mejor que un enlace que aterriza
 * en una lista donde hay que volver a buscar: un enlace que no cumple ensena a no pulsarlos.
 */
export function notificationHref(item: {
  eventType: string;
  referenceType: string | null;
  referenceId: string | null;
}): string | null {
  const { eventType, referenceType, referenceId } = item;

  // Lo tuyo: si se sabe la inscripcion, directo al reproductor; si no, a tu formacion.
  if (eventType === 'ENROLLED' && referenceType === 'enrollments' && referenceId) {
    return `/aprender/${referenceId}`;
  }
  if (eventType === 'ASSIGNMENT_CREATED' && referenceType === 'activities' && referenceId) {
    return `/mi-formacion?actividad=${referenceId}`;
  }
  if (eventType === 'ASSIGNMENT_CREATED' || eventType === 'PLAN_ASSIGNMENTS_CREATED' || eventType === 'ENROLLED') {
    return '/mi-formacion';
  }

  // Lo que tienes que resolver tu.
  if (eventType === 'APPROVAL_REQUESTED') return '/aprobaciones';
  if (eventType === 'OFFERING_PUBLISHED' && referenceType === 'offerings' && referenceId) {
    return `/convocatorias/${referenceId}`;
  }
  if (eventType === 'ATTEMPTS_EXHAUSTED' && referenceType === 'activities' && referenceId) {
    return `/contenido-formativo/${referenceId}`;
  }

  return null;
}
