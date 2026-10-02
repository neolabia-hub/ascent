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
  // Le pasa a TU formacion, aunque la decision la tomara otro: la jornada a la que ibas ya no es.
  OFFERING_CANCELLED: 'formacion',
  // Tu cola de repaso vencio. Lo haces tu, y es sobre lo tuyo.
  REVIEW_DUE_DIGEST: 'formacion',
  // Te dieron un intento mas: lo haces tu.
  EXTRA_ATTEMPT_GRANTED: 'formacion',
  // Lo que tienes que hacer POR OTROS.
  APPROVAL_REQUESTED: 'gestion',
  // Lo que pediste o escribiste tu, de vuelta (2026-10-01).
  APPROVAL_APPROVED: 'gestion',
  APPROVAL_REJECTED: 'gestion',
  FORMACION_EN_REVISION: 'gestion',
  FORMACION_REVISADA: 'gestion',
  PASSWORD_HELP_REQUESTED: 'gestion',
  PERFORMANCE_CYCLE_OPENED: 'gestion',
  PERFORMANCE_REVIEW_SUBMITTED: 'formacion',
  ATTEMPTS_EXHAUSTED: 'gestion',
  // El instructor no se esta formando: le encargan dictar.
  OFFERING_PUBLISHED: 'gestion',
};

export function notificationKind(eventType: string): NotificationKind | null {
  return KIND_BY_EVENT[eventType] ?? null;
}

export const KIND_LABEL: Record<NotificationKind, string> = {
  formacion: 'Tu formación',
  gestion: 'Gestión',
};

/**
 * A DONDE LLEVA CADA AVISO al pulsarlo.
 *
 * Un aviso que no lleva a ninguna parte obliga a leerlo, entenderlo y buscar a mano lo que
 * nombra —y con "tienes una formacion nueva" eso son tres pantallas—. Aqui se traduce el par
 * (evento, referencia) en un destino.
 *
 * Devuelve `null` cuando no hay un sitio honesto al que ir. Es mejor que un enlace que aterriza
 * en una lista donde hay que volver a buscar: un enlace que no cumple enseña a no pulsarlos.
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
    // A la formacion misma: si ya esta empezada entra a ella, si no enseña su tarjeta, y si la
    // obligacion se retiro despues del aviso lo DICE, en vez de dejar a la persona pulsando.
    return `/formacion/${referenceId}`;
  }
  if (eventType === 'ASSIGNMENT_CREATED' || eventType === 'PLAN_ASSIGNMENTS_CREATED' || eventType === 'ENROLLED') {
    return '/mi-formacion';
  }

  // Lo que tienes que resolver tu.
  if (eventType === 'APPROVAL_REQUESTED') return '/aprobaciones';

  /*
    DIRECTO A LO QUE NOMBRA (2026-10-01, pedido del cliente). «Formación lista para revisar» no
    llevaba a ninguna parte: habia que buscarla a mano en el catalogo.
  */
  if ((eventType === 'FORMACION_EN_REVISION' || eventType === 'FORMACION_REVISADA') && referenceType === 'activities' && referenceId) {
    return `/contenido-formativo/${referenceId}`;
  }
  if (eventType === 'APPROVAL_APPROVED' || eventType === 'APPROVAL_REJECTED') {
    if (referenceType === 'activities' && referenceId) return `/contenido-formativo/${referenceId}`;
    if (referenceType === 'offerings' && referenceId) return `/convocatorias/${referenceId}`;
    return '/aprobaciones';
  }
  // Alguien no puede entrar: a su perfil, donde esta «Restablecer contraseña».
  if (eventType === 'PASSWORD_HELP_REQUESTED' && referenceType === 'user' && referenceId) {
    return `/usuarios/${referenceId}`;
  }
  // Las evaluaciones de desempeño que te tocan responder, y la tuya cuando esta lista.
  if (eventType === 'PERFORMANCE_CYCLE_OPENED' || eventType === 'PERFORMANCE_REVIEW_SUBMITTED') return '/mi-desempeno';
  if (eventType === 'OFFERING_PUBLISHED' && referenceType === 'offerings' && referenceId) {
    return `/convocatorias/${referenceId}`;
  }

  /**
   * La jornada cancelada lleva a MI FORMACION y no a la convocatoria: quien recibe este aviso es
   * un aprendiz, y la pantalla de la convocatoria es del panel. Lo que necesita saber es que le
   * queda pendiente ahora, no los datos de una sesion que ya no existe.
   */
  if (eventType === 'OFFERING_CANCELLED') return '/mi-formacion';
  // Al repaso mismo, no a "mi formacion": es lo unico que este aviso nombra.
  if (eventType === 'REVIEW_DUE_DIGEST') return '/repaso';
  // Al perfil de quien agoto los intentos, ya en la fila donde se le da uno mas (2026-10-01).
  if (eventType === 'ATTEMPTS_EXHAUSTED' && referenceType === 'users' && referenceId) {
    return `/usuarios/${referenceId}#intentos-agotados`;
  }
  // Los avisos de antes de ese cambio apuntaban a la formacion: siguen llevando ahi.
  if (eventType === 'ATTEMPTS_EXHAUSTED' && referenceType === 'activities' && referenceId) {
    return `/contenido-formativo/${referenceId}`;
  }
  // Te dieron un intento mas: a esa formacion, a presentarlo.
  if (eventType === 'EXTRA_ATTEMPT_GRANTED' && referenceType === 'activities' && referenceId) {
    return `/formacion/${referenceId}`;
  }

  return null;
}
