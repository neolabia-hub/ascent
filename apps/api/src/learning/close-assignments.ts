/**
 * ¿QUE OBLIGACIONES CIERRA UNA SOLA EJECUCION DE LA FORMACION? (2026-09-15)
 *
 * Vive aparte del servicio y sin tocar la base, misma familia que `due-date.ts`, `next-cycle.ts` y
 * `program-completion.ts`: son dos esquinas que se contradicen entre si y probarlas no deberia
 * costar infraestructura.
 *
 * ─── LAS DOS SITUACIONES QUE HAY QUE DISTINGUIR ───
 *
 * Una misma persona puede tener VARIAS obligaciones vivas de la MISMA formacion, y significan
 * cosas opuestas segun de donde vengan:
 *
 *   reglas distintas   `ruleId` distinto — una formacion exigida a la vez desde su propia ficha y
 *                      desde un programa del que es modulo, con audiencias que se cruzan. Es UNA
 *                      sola cosa pedida por dos sitios: hacerla una vez las cumple LAS DOS, y
 *                      dejar una viva la deja pendiente para siempre sobre algo ya hecho.
 *
 *   rondas acumuladas  MISMO `ruleId`, `cycleNumber` distinto — la politica ACUMULA de
 *                      `next-cycle.ts` ("Nace la nueva y sigue debiendo la anterior"): la ronda sin
 *                      hacer sigue viva A PROPOSITO mientras nace la siguiente. *"A los tres años
 *                      debe tres"*, y se pagan una por vez. Cerrarlas juntas borraria tres años de
 *                      incumplimiento del expediente con una sola asistencia — justo lo que esa
 *                      politica existe para conservar.
 *
 * De ahi la regla: UNA POR REGLA, Y LA MAS ANTIGUA. Las manuales (`ruleId` nulo) forman un grupo
 * entre ellas por lo mismo — dos altas a mano de la misma formacion son dos periodos, no una
 * duplicidad.
 */

export interface ObligacionViva {
  id: string;
  /** `null` = puesta a mano, sin regla detras. */
  ruleId: string | null;
}

/**
 * Las que cierra esta ejecucion, de entre las vivas. **`candidatas` tiene que venir ya ordenada de
 * mas antigua a mas reciente** (`dueAt` asc, `cycleNumber` asc): esta funcion se queda con la
 * primera de cada regla y no vuelve a ordenar, igual que `evaluarPrograma` confia en que el umbral
 * de cada seccion se lo den ya resuelto.
 */
export function obligacionesQueCierra(candidatas: readonly ObligacionViva[]): string[] {
  const porRegla = new Map<string, string>();
  for (const candidata of candidatas) {
    const grupo = candidata.ruleId ?? 'MANUAL';
    if (!porRegla.has(grupo)) porRegla.set(grupo, candidata.id);
  }
  return [...porRegla.values()];
}
