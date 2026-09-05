'use client';

import type { PlanMetrics } from '@/lib/delivery-api';
import type { ResumenEjecucion } from '@/lib/reports-api';
import { cn } from '@/components/ui/cn';

/**
 * LOS TRES NUMEROS DEL PLAN, JUNTOS Y CON SU PREGUNTA DELANTE (Decision #127).
 *
 * ─── EL PROBLEMA QUE CIERRA ───
 *
 * El plan tenia tres porcentajes repartidos por la pantalla y los tres sonaban igual —"cumplimiento",
 * "cobertura", "avance"—. Nadie sabia cual citar en un comite, y dos personas discutian con dos
 * numeros distintos creyendo que hablaban del mismo. Un indicador que hay que explicar cada vez que
 * se ensena no se usa: se ignora.
 *
 * Miden cosas DISTINTAS y por eso ninguno sobra:
 *
 *   PROGRAMA    jornadas ejecutadas / programadas   ->  ¿hicimos lo que dijimos que hariamos?
 *   COBERTURA   capacitados / proyectados           ->  ¿llego la gente que dijimos que llegaria?
 *   PERSONAS    obligaciones cumplidas / total      ->  ¿quien la tiene hecha, hoy?
 *
 * ─── LO QUE DE VERDAD SE MIRA ES LA DIFERENCIA ENTRE ELLOS ───
 *
 * Un plan al 100% de programa y al 60% de cobertura no es un plan que va bien con un matiz: es un
 * plan donde **las jornadas se hicieron y la gente no fue**. La accion es distinta —no hay que
 * programar mas, hay que convocar mejor— y esa lectura solo aparece si los tres numeros estan uno al
 * lado del otro. Por eso esta pantalla existe y por eso escribe la conclusion en palabras: el
 * porcentaje lo lee cualquiera, la contradiccion entre dos porcentajes no.
 */
export function MedicionDelPlan({
  metrics,
  ejecucion,
  goalPct,
}: {
  metrics: PlanMetrics;
  /** El estado de las obligaciones nacidas de ESTE plan. */
  ejecucion: ResumenEjecucion;
  goalPct: number | null;
}) {
  return (
    <section className="card mb-4 p-5">
      <h2 className="font-display text-base font-semibold text-ink-900">Como se esta midiendo este plan</h2>
      <p className="mt-1 text-sm text-ink-500">
        Tres preguntas distintas. Cuando no coinciden, la diferencia es el hallazgo.
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <Indicador
          pregunta="¿Hicimos lo que dijimos?"
          nombre="Programa"
          valor={metrics.compliancePct}
          detalle={`${metrics.executed} jornadas ejecutadas de ${metrics.programmed} programadas`}
          meta={goalPct}
        />
        <Indicador
          pregunta="¿Llego la gente que dijimos?"
          nombre="Cobertura"
          valor={metrics.coveragePct}
          detalle={`${metrics.trained} capacitados de ${metrics.projected} proyectados`}
        />
        <Indicador
          pregunta="¿Quien la tiene hecha hoy?"
          nombre="Personas al dia"
          valor={ejecucion.avancePct}
          detalle={`${ejecucion.terminadas} de ${ejecucion.total} obligaciones del plan cumplidas`}
        />
      </div>

      <Lectura metrics={metrics} ejecucion={ejecucion} />
    </section>
  );
}

function Indicador({
  pregunta,
  nombre,
  valor,
  detalle,
  meta,
}: {
  pregunta: string;
  nombre: string;
  valor: number;
  detalle: string;
  meta?: number | null;
}) {
  return (
    <div className="rounded-xl border border-line bg-paper p-4">
      {/* LA PREGUNTA VA PRIMERO Y EN GRANDE-ish: el nombre del indicador no explica nada por si solo. */}
      <p className="text-sm font-medium leading-snug text-ink-700">{pregunta}</p>
      <p className="mt-3 font-display text-[30px] font-bold leading-none tabular-nums text-ink-900">{valor}%</p>
      <p className="mt-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">{nombre}</p>
      <p className="mt-1 text-xs leading-relaxed text-ink-500">{detalle}</p>
      {meta === null || meta === undefined ? null : (
        <p className={cn('mt-1 text-xs', valor >= meta ? 'text-ok' : 'text-warn')}>
          {/* "Puntos" no: en este producto son los del aprendiz. La meta sola dice lo que falta. */}
          {valor >= meta ? `Meta del ${meta}% cumplida` : `Meta del ${meta}%`}
        </p>
      )}
    </div>
  );
}

/**
 * LA CONCLUSION, ESCRITA.
 *
 * No es adorno: es la unica parte de la pantalla que no exige saber que significa cada indicador.
 * Se dice lo que la combinacion implica y QUE HACER, porque "programa 100 / cobertura 60" y
 * "programa 60 / cobertura 100" piden acciones opuestas y se parecen mucho a simple vista.
 */
function Lectura({ metrics, ejecucion }: { metrics: PlanMetrics; ejecucion: ResumenEjecucion }) {
  const frases: string[] = [];

  if (metrics.programmed === 0) {
    frases.push('El plan todavia no tiene jornadas programadas, asi que no hay nada que medir.');
  } else {
    const brecha = metrics.compliancePct - metrics.coveragePct;
    if (metrics.projected === 0) {
      frases.push(
        'Las jornadas estan programadas pero ningun renglon tiene proyectados congelados: hasta aprobarlos, la cobertura no significa nada.',
      );
    } else if (brecha >= 15) {
      frases.push(
        `Las jornadas se estan haciendo (${metrics.compliancePct}%) pero llega menos gente de la pactada (${metrics.coveragePct}%). El problema no es programar: es convocar y hacer que asistan.`,
      );
    } else if (brecha <= -15) {
      frases.push(
        `Se esta capacitando a mas gente de la que el programa lleva ejecutado: hay formacion ocurriendo fuera del calendario previsto. Vale la pena revisar si el plan quedo corto.`,
      );
    }
  }

  /*
    ESPERANDO CONVOCATORIA ES EL HALLAZGO QUE MAS SE ESCONDE.

    Se lee como incumplimiento de la gente y no lo es: nadie les abrio la puerta. Mientras esa cifra
    sea grande, perseguir personas es perder el tiempo — lo que falta es programar la jornada.
  */
  if (ejecucion.esperando > 0 && ejecucion.total > 0) {
    const pct = Math.round((ejecucion.esperando / ejecucion.total) * 100);
    if (pct >= 10) {
      frases.push(
        `${ejecucion.esperando} obligaciones (${pct}%) estan esperando convocatoria: esas personas no pueden avanzar aunque quieran.`,
      );
    }
  }

  if (ejecucion.atrasadas > 0) {
    frases.push(`${ejecucion.atrasadas} van atrasadas y si tienen a quien reclamar: pudieron entrar y no entraron.`);
  }

  if (frases.length === 0) return null;

  return (
    <div className="mt-4 rounded-xl bg-paper px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">Como se lee</p>
      <ul className="mt-2 space-y-1.5">
        {frases.map((frase) => (
          <li key={frase} className="text-sm leading-relaxed text-ink-700">
            {frase}
          </li>
        ))}
      </ul>
    </div>
  );
}
