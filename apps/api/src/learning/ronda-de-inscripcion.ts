/**
 * UNA INSCRIPCION POR RONDA, no una por convocatoria (2026-10-06).
 *
 * ─── EL FALLO QUE LO OBLIGO ───
 *
 * `enrollments` tenia `UNIQUE(offering_id, user_id)`: una persona, una inscripcion por convocatoria,
 * para siempre. Con una convocatoria PERMANENTE —que es como se dicta una reinduccion: se abre sola
 * al publicar y la gente entra cuando le toca— la SEGUNDA vez la persona caia en la inscripcion del
 * año anterior, ya terminada: el examen respondia «Ya aprobaste esta evaluación» y la obligacion
 * nueva no se podia cumplir. Lo destapo `programa-reinduccion-completo.mjs`. Nadie lo habia visto
 * porque hasta ahora cada campaña se estrenaba publicando una version nueva, que abre convocatoria
 * nueva; con la reinduccion automatica por fecha de ingreso las rondas caen todo el año sobre la
 * misma convocatoria.
 *
 * ─── LA REGLA, que es la que ya usa el resto del producto ───
 *
 * «Una fila por ronda, inmutable» (`CertificationGrant`, la inscripcion de un PROGRAMA). La
 * inscripcion de la ronda anterior no se reabre ni se pisa: es la evidencia de esa vuelta —su
 * avance, sus intentos, su nota, su constancia—. La ronda nueva abre SU fila, en la MISMA
 * convocatoria. No hace falta crear una convocatoria por ronda ni publicar una version para que la
 * gente pueda volver a cursar.
 *
 * Cuando es ronda nueva lo dice la OBLIGACION, no el calendario: hay una obligacion abierta de esa
 * formacion que no es la que la inscripcion anterior venia a cumplir.
 */

export interface InscripcionPrevia {
  id: string;
  status: string;
  round: number;
  assignmentId: string | null;
}

export type DecisionDeInscripcion = { reusar: string } | { crear: number };

const VIVA = new Set(['ENROLLED', 'IN_PROGRESS']);

/**
 * Que hacer cuando alguien entra (o lo convocan) a una convocatoria en la que quiza ya estuvo.
 *
 * @param previas  sus inscripciones EN ESTA convocatoria, de cualquier ronda
 * @param obligacionAbiertaId  la obligacion abierta de esa formacion, si tiene alguna
 */
export function decidirInscripcion(
  previas: InscripcionPrevia[],
  obligacionAbiertaId: string | null,
): DecisionDeInscripcion {
  const viva = previas.find((fila) => VIVA.has(fila.status));
  if (viva) return { reusar: viva.id };

  const ultima = previas.reduce<InscripcionPrevia | null>(
    (mayor, fila) => (mayor === null || fila.round > mayor.round ? fila : mayor),
    null,
  );
  if (!ultima) return { crear: 1 };

  // Ronda nueva: debe la formacion otra vez, y no por la obligacion que aquella inscripcion cerro.
  if (obligacionAbiertaId !== null && obligacionAbiertaId !== ultima.assignmentId) {
    return { crear: ultima.round + 1 };
  }
  // Sin obligacion nueva, volver a entrar es repasar lo que ya hizo: la misma inscripcion.
  return { reusar: ultima.id };
}
