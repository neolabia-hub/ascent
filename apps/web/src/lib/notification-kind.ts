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
