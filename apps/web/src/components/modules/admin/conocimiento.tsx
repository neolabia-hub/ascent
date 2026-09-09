'use client';

import { useEffect, useState } from 'react';
import { HelpCircle } from 'lucide-react';
import { getConocimiento, type Conocimiento as DatosConocimiento } from '@/lib/analytics-api';
import { Ayuda } from '@/components/ui/ayuda';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/components/ui/cn';

/**
 * EN QUÉ FALLA LA GENTE (2026-09-09).
 *
 * ─── POR QUÉ ESTE INFORME Y NO OTRO PORCENTAJE DE APROBADOS ───
 *
 * Todo lo demás cuenta **cuántos aprobaron**. Eso dice si el año fue bien, y no dice qué hacer.
 * Esto cuenta **qué fallaron**, que es lo único de todos los informes que se convierte directamente
 * en un renglón del plan del año siguiente: «el 68 % falla lo de alturas» es una formación que
 * pedir; «el 91 % aprobó» no es nada que hacer.
 *
 * Es la pareja de «En qué estamos flojos» de Desempeño, y a propósito se llaman parecido: una mira
 * lo que el jefe opina de la persona, la otra lo que la persona contestó. Cuando las dos señalan al
 * mismo sitio, ya no es una opinión.
 *
 * ─── LAS DOS LISTAS SON DOS DECISIONES DISTINTAS ───
 *
 * **Por tema** dice qué enseñar. **Las preguntas más falladas** dicen algo más incómodo y más útil:
 * una pregunta que casi todo el mundo falla o no se enseñó, o está mal redactada. Las dos cosas hay
 * que arreglarlas, en sitios distintos — y por eso la lista lleva al lado cuántas personas la
 * contestaron, que es lo que permite distinguir un problema real de una pregunta rara.
 */
export function Conocimiento() {
  const [datos, setDatos] = useState<DatosConocimiento | null>(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    void getConocimiento()
      .then(setDatos)
      .catch(() => setFallo(true));
  }, []);

  if (fallo) {
    return (
      <section className="card p-5">
        <h2 className="font-display text-[15px] font-semibold text-ink-900">En qué falla la gente</h2>
        <p className="mt-3 rounded-lg bg-paper px-4 py-3 text-sm text-ink-700">
          No se pudo cargar. El resto de la pantalla sigue sirviendo.
        </p>
      </section>
    );
  }

  return (
    <section className="card p-5">
      <div className="flex items-start gap-1.5">
        <h2 className="font-display text-[15px] font-semibold text-ink-900">En qué falla la gente</h2>
        <Ayuda sobre="cómo se cuenta esto">
          Se cuenta por <strong>puntos</strong> y no por preguntas acertadas: una de cinco puntos y una de
          uno no pesan igual en el examen. No entran las preguntas anuladas —esas midieron que la pregunta
          estaba mal, no lo que alguien sabe— ni las abiertas que todavía nadie ha calificado, que no son un
          cero sino una respuesta sin mirar.
        </Ayuda>
      </div>
      <p className="mt-0.5 text-sm text-ink-500">
        Lo que contestaron de verdad en los exámenes, del tema más flojo al más fuerte.
      </p>

      {!datos ? (
        <Skeleton className="mt-4 h-40 w-full" />
      ) : datos.porTema.length === 0 ? (
        <EmptyState
          className="mt-4"
          icon={HelpCircle}
          title="Todavía nadie ha presentado un examen"
          description="En cuanto haya intentos calificados, aquí sale en qué falla la gente."
        />
      ) : (
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">Por tema</h3>
            <ul className="mt-2 space-y-1.5">
              {datos.porTema.map((tema) => (
                <li
                  key={tema.categoryId ?? 'sin-tema'}
                  className="flex items-center gap-3 rounded-lg bg-paper px-3 py-2"
                >
                  <span
                    className={cn(
                      'min-w-0 flex-1 truncate text-sm',
                      tema.categoryId === null ? 'italic text-ink-500' : 'text-ink-900',
                    )}
                  >
                    {tema.name}
                  </span>
                  <span className="hidden h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-surface sm:block">
                    <span
                      className={cn('block h-full rounded-full', barra(tema.aciertoPct))}
                      style={{ width: `${tema.aciertoPct ?? 0}%` }}
                    />
                  </span>
                  <span className="w-11 shrink-0 text-right text-sm font-semibold tabular-nums text-ink-900">
                    {tema.aciertoPct === null ? '—' : `${tema.aciertoPct}%`}
                  </span>
                </li>
              ))}
            </ul>
            {/*
              LAS SIN TEMA SE DICEN, NO SE ESCONDEN. El tema es opcional (#84), asi que al principio
              son la mayoria: repartirlas o callarlas daria un cuadro de cobertura que no es cierto.
            */}
            {datos.porTema.some((tema) => tema.categoryId === null) ? (
              <p className="mt-2 text-xs text-ink-500">
                «Sin tema» son preguntas a las que nadie les puso etiqueta. Poniéndosela desde el editor de
                la evaluación, se reparten solas en esta lista.
              </p>
            ) : null}
          </div>

          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
              Las preguntas que más se fallan
            </h3>
            {datos.peoresPreguntas.length === 0 ? (
              <p className="mt-2 text-sm text-ink-500">
                Todavía ninguna pregunta la han contestado cinco personas. Con menos, un porcentaje no dice
                nada.
              </p>
            ) : (
              <>
                <ul className="mt-2 space-y-1.5">
                  {datos.peoresPreguntas.map((pregunta) => (
                    <li key={pregunta.questionVersionId} className="rounded-lg bg-paper px-3 py-2">
                      <div className="flex items-start gap-3">
                        <p className="min-w-0 flex-1 text-sm leading-snug text-ink-900">{pregunta.stem}</p>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-ink-900">
                          {pregunta.aciertoPct}%
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {pregunta.categoryName ?? 'sin tema'} · {pregunta.respuestas} respuestas
                      </p>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-ink-500">
                  Una pregunta que falla casi todo el mundo o <strong>no se enseñó</strong>, o{' '}
                  <strong>está mal redactada</strong>. Las dos hay que arreglarlas, en sitios distintos.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * EL COLOR DE LA BARRA, con la misma banda que el resto del producto: bajo 60 hay un problema,
 * entre 60 y 80 hay margen, por encima está bien. Sin umbral, un 58 % y un 88 % se ven igual de
 * largos y hay que compararlos a mano.
 */
function barra(pct: number | null): string {
  if (pct === null) return 'bg-line';
  if (pct < 60) return 'bg-danger';
  if (pct < 80) return 'bg-warn';
  return 'bg-ok';
}
