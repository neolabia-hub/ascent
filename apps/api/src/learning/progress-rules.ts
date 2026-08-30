/**
 * LAS DOS REGLAS DEL AVANCE, aparte del servicio y probadas.
 *
 * Viven fuera de `PlayerService` por lo mismo que `version-migration.ts`: deciden si una pieza
 * cuenta como cumplida y que queda escrito de ella, y eso es exactamente lo que un auditor mira.
 * Una regla que solo se puede comprobar levantando la base de datos no se comprueba nunca.
 */

/** Como se supo el porcentaje. Ver Decision #46. */
export type Evidence = 'MEASURED' | 'DECLARED';

/** Lo que se guarda en `activity_progress.data`. */
export interface ProgressData {
  /** Ultima tarjeta o diapositiva vista, para retomar donde se quedo. */
  lastCardIndex: number;
  evidence?: Evidence;
}

export interface ProgressSubmission {
  lastCardIndex?: number;
  evidence?: Evidence;
}

interface CompletionSettings {
  minWatchPct?: number;
  minSeconds?: number;
}

/**
 * CUANTO HAY QUE VER de un video para darlo por visto, resuelto en cascada.
 *
 * La formacion manda sobre la empresa, y la empresa sobre la plataforma (Decision #27). Antes el
 * 90 estaba clavado en dos sitios —esta regla y el reproductor—, asi que una empresa que quisiera
 * exigir el video entero no tenia como pedirlo.
 */
export function resolveMinWatchPct(config: unknown, tenantDefault: number): number {
  const own = (config as CompletionSettings | null)?.minWatchPct;
  return typeof own === 'number' && own > 0 && own <= 100 ? Math.round(own) : tenantDefault;
}

/**
 * Criterio de completitud de una pieza.
 *
 * El "tiempo minimo" es el freno al click siguiente: no bloquea a nadie, pero no da por vista una
 * tarjeta que estuvo dos segundos en pantalla.
 *
 * Un VIDEO admite un umbral por debajo del 100% (los creditos finales no son el contenido). Una
 * PRESENTACION no: cada diapositiva se pasa a mano, no hay barra que arrastrar, y saltarse la
 * mitad es no haberla visto. El resto de tipos se completan enteros.
 */
export function meetsCompletion(
  type: string,
  config: unknown,
  pct: number,
  timeSpentS: number,
  minWatchPctDefault = 90,
): boolean {
  const settings = ((config ?? {}) as CompletionSettings) ?? {};
  if (type === 'VIDEO') {
    return pct >= resolveMinWatchPct(config, minWatchPctDefault);
  }
  return pct >= 100 && timeSpentS >= (settings.minSeconds ?? 0);
}

/**
 * Los datos del avance se MEZCLAN, no se pisan: cada envio trae solo lo que sabe. Escribir el
 * objeto entero hacia que un envio sin `lastCardIndex` borrara por donde iba la persona.
 *
 * `evidence` se conserva en su PEOR forma: si una parte del contenido se dio por vista con una
 * declaracion, el registro no asciende a MEDIDA porque un envio posterior venga medido. Ante un
 * auditor, lo que vale es como se supo la primera vez que se dio por cumplido.
 */
export function mergeProgressData(existing: unknown, input: ProgressSubmission): ProgressData {
  const previous = (existing ?? {}) as { lastCardIndex?: unknown; evidence?: unknown };
  const lastCardIndex =
    input.lastCardIndex ?? (typeof previous.lastCardIndex === 'number' ? previous.lastCardIndex : 0);
  const evidence = previous.evidence === 'DECLARED' ? 'DECLARED' : (input.evidence ?? previous.evidence);
  return {
    lastCardIndex,
    ...(evidence === 'MEASURED' || evidence === 'DECLARED' ? { evidence } : {}),
  };
}

/** Por donde iba, tolerando un `data` viejo, vacio o con basura. */
export function readLastCard(data: unknown): number {
  const parsed = (data ?? {}) as { lastCardIndex?: unknown };
  return typeof parsed.lastCardIndex === 'number' ? parsed.lastCardIndex : 0;
}
