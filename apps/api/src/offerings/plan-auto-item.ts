/**
 * PROGRAMAR UNA JORNADA DE UNA CAPACITACION DEL PLAN **ES** PONERLA EN EL PLAN (Decision #75).
 *
 * Lo reporto el cliente haciendo lo natural: creo la capacitacion, lleno la ficha, el contenido,
 * Quienes, y programo la jornada desde la pestana Programacion. La convocatoria quedo PUBLICADA...
 * y el plan seguia vacio, con la ficha diciendo "esta capacitacion no esta en el plan de 2026" al
 * lado de un boton para programarla otra vez. Su reaccion fue la correcta: *"no se si es
 * redundante, por que se supone que si se programa se debe crear en el plan"*.
 *
 * Y lo era. Habia tres caminos para crear una jornada —el plan, la pestana Programacion de la
 * ficha, y el modulo Convocatorias— y solo el primero creaba el renglon. Los otros dos dejaban una
 * jornada huerfana: se dicta, la gente asiste, y no cuenta para el cumplimiento de nadie.
 *
 * Esto decide, sin tocar la base, a que plan entra y en que mes. Vive aparte y puro, como
 * `plan-deletion.ts`: decide si algo entra en el programa anual de una empresa.
 *
 * ── Por que SOLO en plan BORRADOR ──────────────────────────────────────────────
 *
 * Un renglon en un plan aprobado o en ejecucion **nace obligando a gente real**, y por eso la
 * Decision #55 exige decir POR QUE. Un motivo no se puede inventar por detras: ahi la ficha tiene
 * que preguntarlo, y para eso esta el boton "Programar en el plan". En BORRADOR no hay nada que
 * justificar —el plan todavia no obliga a nadie— asi que entrar sola es solo ahorrarle a alguien
 * un paso que iba a dar igual.
 *
 * ── De donde sale el mes ───────────────────────────────────────────────────────
 *
 * De la FECHA de la jornada, que es el mismo criterio que ya usa el formulario. Cuando no hay
 * fecha ni ventana —una permanente de autoservicio— se usa el mes en curso: es lo unico honesto
 * que se puede decir de algo que esta disponible desde ya, y sigue siendo corregible arrastrandola
 * en el cronograma.
 */

export interface PlanCandidato {
  id: string;
  year: number;
  status: string;
}

export interface RenglonAutomatico {
  planId: string;
  plannedMonth: number;
}

/**
 * @param participaEnElPlan lo que dice el tipo de la formacion (`config.participatesInPlan`).
 * @param fecha             'YYYY-MM-DD' de la sesion, o el inicio de la ventana. `null` si no hay.
 * @param planes            los planes del tenant. Se filtran aqui, para poder probarlo.
 * @param hoy               inyectado para que la prueba no dependa del dia en que se corra.
 */
export function renglonAutomatico(
  participaEnElPlan: boolean,
  fecha: string | null,
  planes: PlanCandidato[],
  hoy: Date,
): RenglonAutomatico | null {
  if (!participaEnElPlan) return null;

  // Se parte el texto en vez de construir un Date: 'YYYY-MM-DD' se interpretaria como UTC y en
  // Colombia devolveria el mes anterior el dia 1 (la leccion de `fromDateOnly`, RUNBOOK 08-27).
  const valida = fecha !== null && /^\d{4}-\d{2}-\d{2}$/.test(fecha);
  const year = valida ? Number((fecha as string).slice(0, 4)) : hoy.getFullYear();
  const plannedMonth = valida ? Number((fecha as string).slice(5, 7)) : hoy.getMonth() + 1;
  if (plannedMonth < 1 || plannedMonth > 12) return null;

  const plan = planes.find((row) => row.year === year && row.status === 'DRAFT');
  return plan ? { planId: plan.id, plannedMonth } : null;
}
