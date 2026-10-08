/**
 * QUE INTENTOS Y QUE ENCUESTA CUENTAN HOY, y cuales son de una version que la persona ya no cursa.
 *
 * ─── EL FALLO QUE OBLIGA A QUE ESTO EXISTA (2026-10-05, produccion) ───
 *
 * Una persona salia en Seguimiento como «Sin empezar» con 10 intentos, 80 % y la encuesta
 * respondida. Las dos mitades de la fila eran ciertas y juntas se contradecian: la formacion se
 * habia publicado de nuevo con «quienes van a mitad reinician» (`RESTART_NEW`), la inscripcion
 * volvio a `ENROLLED` sobre la version nueva —por eso «sin empezar»— y los intentos seguian
 * colgando de la misma inscripcion, aunque eran del examen de la version anterior.
 *
 * El estado no se toca: para la version que hoy se le exige, de verdad no ha empezado. Lo que
 * estaba mal era sumar a esa fila lo que hizo en un contenido que ya no cuenta.
 *
 * ─── LA REGLA ───
 *
 * Un intento es ANTERIOR cuando su inscripcion fue movida de version y la evaluacion que rindio no
 * pertenece a la version que cursa ahora. Se pregunta por la EVALUACION y no por la hora, a
 * proposito: quien tenia el examen viejo abierto en el celular puede enviarlo despues del cambio, y
 * por la hora ese intento pareceria de la version nueva.
 *
 * La encuesta no guarda a que contenido respondia, asi que ahi si se usa la fecha: una respuesta
 * anterior al cambio es de la version anterior, y solo cuando el cambio REINICIO —si la persona
 * siguio donde iba, su encuesta sigue valiendo—.
 *
 * Lo anterior no se esconde: se devuelve aparte para que la fila pueda decir que hubo un reinicio y
 * que habia antes. Es historia, no ruido, y quien audita la va a pedir.
 */

export interface InscripcionParaIntentos {
  id: string;
  userId: string;
  activityVersionId: string;
  /** `migratedAt` y `migratedFromVersionNumber`, escritos al mover la inscripcion de version. */
  scoreSnapshot: unknown;
}

export interface IntentoParaContar {
  userId: string;
  enrollmentId: string;
  assessmentId: string;
  score: unknown;
}

export interface EncuestaParaContar {
  respondentUserId: string;
  enrollmentId: string;
  result: string | null;
  respondedAt: Date;
}

export interface ReinicioPorVersion {
  /** Version que cursaba antes del cambio, o `null` si no quedo escrita. */
  desdeVersion: number | null;
  fecha: string;
  intentosAnteriores: number;
  mejorNotaAnterior: number | null;
  respondioEncuestaAnterior: boolean;
}

export interface LoQueCuentaHoy {
  intentos: number;
  mejorNota: number | null;
  /** `undefined` = no la ha respondido; un valor (incluido `null`) = que dijo. */
  encuesta: string | null | undefined;
  /** Lo que hizo en la version anterior, por inscripcion. Solo las que de verdad dejaron algo atras. */
  reinicios: Map<string, ReinicioPorVersion>;
}

interface Migracion {
  fecha: string;
  desdeVersion: number | null;
}

function migracionDe(scoreSnapshot: unknown): Migracion | null {
  if (!scoreSnapshot || typeof scoreSnapshot !== 'object') return null;
  const foto = scoreSnapshot as Record<string, unknown>;
  if (typeof foto.migratedAt !== 'string') return null;
  return {
    fecha: foto.migratedAt,
    desdeVersion: typeof foto.migratedFromVersionNumber === 'number' ? foto.migratedFromVersionNumber : null,
  };
}

// La MEJOR y no la ultima: quien aprobo con 95 y repaso el examen sacando 80 por curiosidad
// acredito 95.
const mejor = (previa: number | null, valor: number): number => (previa === null || valor > previa ? valor : previa);

/**
 * @param evaluacionesPorVersion  Que evaluaciones tiene cada version de la formacion.
 */
export function loQueCuentaHoy(
  inscripciones: readonly InscripcionParaIntentos[],
  intentos: readonly IntentoParaContar[],
  encuestas: readonly EncuestaParaContar[],
  evaluacionesPorVersion: ReadonlyMap<string, ReadonlySet<string>>,
): Map<string, LoQueCuentaHoy> {
  const porUsuario = new Map<string, LoQueCuentaHoy>();
  const deUsuario = (userId: string): LoQueCuentaHoy => {
    let fila = porUsuario.get(userId);
    if (!fila) {
      fila = { intentos: 0, mejorNota: null, encuesta: undefined, reinicios: new Map() };
      porUsuario.set(userId, fila);
    }
    return fila;
  };

  const inscripcionPorId = new Map(inscripciones.map((fila) => [fila.id, fila]));
  const migracionPorInscripcion = new Map<string, Migracion>();
  for (const inscripcion of inscripciones) {
    const migracion = migracionDe(inscripcion.scoreSnapshot);
    if (migracion) migracionPorInscripcion.set(inscripcion.id, migracion);
  }

  const reinicioDe = (userId: string, enrollmentId: string, migracion: Migracion): ReinicioPorVersion => {
    const fila = deUsuario(userId);
    let reinicio = fila.reinicios.get(enrollmentId);
    if (!reinicio) {
      reinicio = {
        desdeVersion: migracion.desdeVersion,
        fecha: migracion.fecha,
        intentosAnteriores: 0,
        mejorNotaAnterior: null,
        respondioEncuestaAnterior: false,
      };
      fila.reinicios.set(enrollmentId, reinicio);
    }
    return reinicio;
  };

  for (const intento of intentos) {
    const inscripcion = inscripcionPorId.get(intento.enrollmentId);
    const migracion = migracionPorInscripcion.get(intento.enrollmentId);
    const vigentes = inscripcion ? evaluacionesPorVersion.get(inscripcion.activityVersionId) : undefined;
    const nota = intento.score === null || intento.score === undefined ? null : Number(intento.score);

    if (migracion && !(vigentes?.has(intento.assessmentId) ?? false)) {
      const reinicio = reinicioDe(intento.userId, intento.enrollmentId, migracion);
      reinicio.intentosAnteriores += 1;
      if (nota !== null) reinicio.mejorNotaAnterior = mejor(reinicio.mejorNotaAnterior, nota);
      continue;
    }

    const fila = deUsuario(intento.userId);
    fila.intentos += 1;
    if (nota !== null) fila.mejorNota = mejor(fila.mejorNota, nota);
  }

  /*
    La encuesta solo queda atras si el cambio de version REINICIO a la persona, y eso se sabe por
    los intentos: `MOVE_NOT_STARTED` solo mueve a quien no tiene ninguno, asi que una inscripcion
    movida con intentos de otra evaluacion es, por fuerza, una reiniciada.
  */
  for (const encuesta of encuestas) {
    const migracion = migracionPorInscripcion.get(encuesta.enrollmentId);
    const fila = deUsuario(encuesta.respondentUserId);
    const reinicio = fila.reinicios.get(encuesta.enrollmentId);

    if (migracion && reinicio && encuesta.respondedAt.getTime() < new Date(migracion.fecha).getTime()) {
      reinicio.respondioEncuestaAnterior = true;
      continue;
    }
    fila.encuesta = encuesta.result;
  }

  return porUsuario;
}
