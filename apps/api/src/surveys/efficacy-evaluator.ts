export interface AreaEnCadena {
  id: string;
  responsibleUserId: string | null;
  parentId: string | null;
}

export interface ContextoDelEvaluador {
  /** A quien se le hizo la formacion. Nunca puede evaluarse a si mismo. */
  personaId: string;
  /** El area de la persona y, hacia arriba, sus areas padre. */
  cadenaDeAreas: AreaEnCadena[];
  /** Quien responde por el PROCESO de la formacion. Respaldo, no primera opcion. */
  responsableDelProcesoId: string | null;
}

export interface Evaluador {
  userId: string;
  /** De donde salio. La pantalla lo dice: "su jefe de area" no es lo mismo que "el dueno del proceso". */
  origen: 'AREA' | 'AREA_SUPERIOR' | 'PROCESO';
}

/**
 * QUIEN RESPONDE LA ENCUESTA DE EFICACIA sobre una persona (Decision #115).
 *
 * ─── LA PREGUNTA QUE HAY QUE CONTESTAR PRIMERO ───
 *
 * La encuesta de eficacia pregunta **si esa persona aplica en su puesto lo que aprendio**. No es
 * una pregunta tecnica sobre el tema: es una observacion del trabajo diario. Asi que el evaluador
 * correcto no es quien mas sabe de alturas — es **quien ve trabajar a esa persona**.
 *
 * ─── POR QUE EL AREA MANDA SOBRE EL PROCESO ───
 *
 * El cliente lo planteo al reves: *"lo que se evalua es el proceso casi siempre"*. Lo que se
 * evalua efectivamente pertenece a un proceso —la formacion es de SST, de PESV, de SARLAFT— pero
 * quien responde no puede ser el dueno de ese proceso:
 *
 * | | El jefe del area | El responsable del proceso |
 * |---|---|---|
 * | ¿Ve trabajar a la persona? | Si, todos los dias | No |
 * | ¿A cuanta gente evaluaria? | A su equipo | A las 600 de la empresa |
 * | ¿Sabe del tema? | No necesariamente | Si |
 *
 * El coordinador de SST es dueno del proceso de casi toda la formacion obligatoria. Si evaluara la
 * eficacia, tendria que decir de seiscientas personas si aplican lo aprendido — y de la mayoria no
 * ha visto ni un turno. Lo que sale de ahi son seiscientos "si" pulsados en fila, que es peor que
 * no medir: ensucia el indicador y da por buena una transferencia que nadie comprobo.
 *
 * ─── PERO EL PROCESO SI ES EL RESPALDO ───
 *
 * Cuando el area no tiene jefe asignado, el dueno del proceso es mejor que nadie: al menos conoce
 * el tema y puede pedir la informacion. Se marca con `origen: 'PROCESO'` para que la pantalla lo
 * diga y para que se vea, en los reportes, cuanta eficacia se esta midiendo por el camino bueno.
 *
 * ─── SE SUBE POR EL ARBOL DE AREAS ───
 *
 * "Bodega" puede no tener jefe propio y colgar de "Logistica", que si. Subir es lo correcto: el
 * jefe de Logistica si ve trabajar a la gente de Bodega. Se sube hasta encontrar responsable.
 *
 * ─── NADIE SE EVALUA A SI MISMO ───
 *
 * Un jefe de area tambien hace sus formaciones, y su propia area lo tiene a el como responsable.
 * Sin esta regla se autoevaluaria, que no es una evaluacion. En ese caso se sube un nivel mas, y
 * si arriba no hay nadie, cae al proceso.
 *
 * Devuelve `null` cuando no hay a quien preguntar. Es un estado legitimo y VISIBLE: mejor no
 * programar la encuesta que mandarsela a alguien que no puede responderla con criterio.
 */
export function resolverEvaluador(contexto: ContextoDelEvaluador): Evaluador | null {
  const { personaId, cadenaDeAreas, responsableDelProcesoId } = contexto;

  for (const [nivel, area] of cadenaDeAreas.entries()) {
    const responsable = area.responsibleUserId;
    if (!responsable) continue;
    // Nadie se evalua a si mismo: se sigue subiendo.
    if (responsable === personaId) continue;
    return { userId: responsable, origen: nivel === 0 ? 'AREA' : 'AREA_SUPERIOR' };
  }

  if (responsableDelProcesoId && responsableDelProcesoId !== personaId) {
    return { userId: responsableDelProcesoId, origen: 'PROCESO' };
  }

  return null;
}

/**
 * Ordena las areas desde la de la persona hacia arriba.
 *
 * Se protege de un ciclo (`A` padre de `B` y `B` padre de `A`) con un conjunto de visitados: un
 * arbol mal armado a mano no puede colgar el servidor en un bucle infinito, y eso se arregla con
 * dos lineas aqui en vez de con una restriccion que nadie escribiria.
 */
export function cadenaDesde(areaId: string, areas: AreaEnCadena[]): AreaEnCadena[] {
  const porId = new Map(areas.map((area) => [area.id, area]));
  const cadena: AreaEnCadena[] = [];
  const vistas = new Set<string>();

  let actual = porId.get(areaId);
  while (actual && !vistas.has(actual.id)) {
    vistas.add(actual.id);
    cadena.push(actual);
    actual = actual.parentId ? porId.get(actual.parentId) : undefined;
  }
  return cadena;
}
