/**
 * QUE HACER CON CADA PERSONA AL MATERIALIZAR UN RENGLON DEL PLAN (Decision #73).
 *
 * Vive aparte y pura, como `plan-deletion.ts` y `due-date.ts`: decide sobre las obligaciones de
 * personas reales y tiene que poder leerse y probarse sin levantar nada.
 *
 * El problema que resuelve. Una capacitacion del plan obliga a marcar Quienes, y el plan deriva a
 * quien obligar **de los ya obligados** (`projected.resolve`). Asi que el plan se encontraba
 * siempre con gente que YA tenia esa obligacion, y creaba una segunda. No era un caso raro: era
 * el 100% de los casos, y de ahi salian tres danos —la formacion duplicada en los pendientes,
 * terminarla cerraba solo una y la otra vencia, y la cobertura del plan podia marcar 0% con todo
 * el mundo capacitado, porque la inscripcion se ataba a la otra—.
 *
 * La obligacion de una persona con una formacion es UNA. Lo que el plan necesita no es una fila
 * propia sino saber CUAL cuenta para el, y eso es `plan_item_id`.
 *
 * Tres destinos, y solo tres:
 *
 *   ADOPTAR   ya tiene una obligacion SIN sello: se le estampa este renglon. Ni se duplica ni se
 *             le mueve el vencimiento —ya se le dijo una fecha— ni se le vuelve a avisar.
 *   CREAR     no tiene ninguna: nace del plan (`source = PLAN`) con el ultimo dia de su mes.
 *   SALTAR    ya la cuenta este renglon (aprobar dos veces no puede contarla dos veces) o la
 *             cuenta OTRO renglon del plan. Lo segundo importa tanto como lo primero: contar a la
 *             misma persona en dos renglones infla el denominador igual que el fallo de los 40
 *             obligados saliendo como 80 proyectados (Decision #68).
 */

/** Lo minimo de una obligacion viva o cumplida de esa persona con esa formacion. */
export interface ObligacionExistente {
  id: string;
  userId: string;
  /** El renglon que ya la cuenta, o null si todavia no la cuenta ninguno. */
  planItemId: string | null;
}

export interface RepartoDeObligaciones {
  /** Ids de ASIGNACION a las que hay que estamparles el renglon. */
  adoptar: string[];
  /** Ids de PERSONA a las que hay que crearles la obligacion. */
  crear: string[];
  /** Cuantas ya estaban contadas por este plan. Sirve para explicar el numero, no para actuar. */
  yaContadas: number;
}

export function repartirObligaciones(
  itemId: string,
  proyectados: string[],
  existentes: ObligacionExistente[],
): RepartoDeObligaciones {
  /** La primera sin sello de cada persona: la que se puede adoptar. */
  const adoptable = new Map<string, string>();
  /** Quien ya esta contado por algun renglon del plan —este u otro—. */
  const contado = new Set<string>();

  for (const fila of existentes) {
    if (fila.planItemId !== null) {
      contado.add(fila.userId);
    } else if (!adoptable.has(fila.userId)) {
      adoptable.set(fila.userId, fila.id);
    }
  }

  const adoptar: string[] = [];
  const crear: string[] = [];
  let yaContadas = 0;

  // Se recorre la lista de PROYECTADOS y no la de existentes: el orden y el conjunto los manda
  // quien tiene que capacitarse, no lo que hubiera en la tabla.
  for (const userId of [...new Set(proyectados)]) {
    if (contado.has(userId)) {
      yaContadas += 1;
      continue;
    }
    const id = adoptable.get(userId);
    if (id) adoptar.push(id);
    else crear.push(userId);
  }

  return { adoptar, crear, yaContadas };
}
