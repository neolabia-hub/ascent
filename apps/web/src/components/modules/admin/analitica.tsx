'use client';

import { useEffect, useMemo, useState } from 'react';
import { Info } from 'lucide-react';
import { DIMENSION_LABEL, getAnalitica, type Analitica, type CorteAnalitica } from '@/lib/analytics-api';
import { BarraEjecucion } from '@/components/modules/admin/barra-ejecucion';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/components/ui/cn';

/**
 * LA MISMA EJECUCION, CORTADA POR DONDE HAGA FALTA (Decision #125).
 *
 * ─── PARA QUIEN ES ESTA PANTALLA ───
 *
 * Para quien decide, no para quien persigue. El seguimiento sirve para ir detras de UNA formacion;
 * esto sirve para contestar "¿donde esta el problema?" antes de saber que formacion mirar. Son
 * preguntas distintas y por eso son pestanas distintas y no una sola con filtros.
 *
 * ─── LOS SIETE CORTES SE VEN JUNTOS ───
 *
 * Un selector de dimension obligaria a recordar el numero del corte anterior para compararlo con el
 * siguiente, y nadie lo recuerda: se elige uno, se mira, y los demas no se abren. Puestos uno al
 * lado del otro, "el area de Logistica va mal" y "la regional Caribe va mal" se leen en el mismo
 * golpe de vista — y muchas veces son la misma gente vista de dos formas, que es justo lo que hay
 * que descubrir.
 */
export function Analitica({ planId }: { planId?: string | null }) {
  const [datos, setDatos] = useState<Analitica | null>(null);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    setDatos(null);
    setFallo(false);
    void getAnalitica(planId)
      .then(setDatos)
      .catch(() => setFallo(true));
  }, [planId]);

  if (fallo) {
    return (
      <EmptyState
        icon={Info}
        title="No se pudo calcular la analitica"
        description="Vuelve a intentarlo en un momento."
      />
    );
  }

  if (!datos) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-xl" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (datos.resumen.total === 0) {
    return (
      <EmptyState
        icon={Info}
        title="Todavía no hay obligaciones que analizar"
        description={
          planId
            ? 'Este plan aun no ha generado obligaciones: se crean al aprobar sus renglones.'
            : 'Cuando se asignen formaciones, aqui se vera como va cada area, cargo, regional y norma.'
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      <section className="card p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            {/*
              EL ROTULO DICE DE QUE ES EL NUMERO.

              "Avance general" no decia si era del plan o de todo, y al lado de "cumplimiento" y
              "cobertura" del plan sonaba a un tercer sinonimo. Tres porcentajes que suenan igual y
              miden cosas distintas es la forma mas rapida de que nadie se fie de ninguno.
            */}
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">
              {planId ? 'Obligaciones de este plan' : 'Obligaciones cumplidas'}
            </p>
            <p className="mt-1 font-display text-[32px] font-bold leading-none tabular-nums text-ink-900">
              {datos.resumen.avancePct}%
            </p>
            <p className="mt-1 text-xs text-ink-500">
              {planId
                ? 'Solo lo nacido de este plan'
                : 'Toda la formacion viva: plan, inducciones, pildoras y extraordinarias'}
            </p>
          </div>
          <p className="text-sm text-ink-500">
            {datos.resumen.terminadas} de {datos.resumen.total} obligaciones cumplidas
          </p>
        </div>
        <div className="mt-4">
          <BarraEjecucion resumen={datos.resumen} />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {datos.dimensiones.map((corte) => (
          <Corte key={corte.dimension} corte={corte} universo={datos.resumen.total} />
        ))}
      </div>
    </div>
  );
}

/** Un corte: la lista de grupos de una dimension, ordenada por lo que hay que mirar. */
function Corte({ corte, universo }: { corte: CorteAnalitica; universo: number }) {
  /*
    SOLO LOS PRIMEROS, con un boton para ver el resto.

    "Por cargo" puede traer sesenta filas y "por area" nueve. Sin tope, la tarjeta de cargos empuja
    a todas las demas fuera de la pantalla y el corte que importaba deja de verse. Las filas estan
    ordenadas por urgencia, asi que las primeras son las que hay que mirar.
  */
  const [todos, setTodos] = useState(false);
  const visibles = useMemo(() => (todos ? corte.grupos : corte.grupos.slice(0, 6)), [corte.grupos, todos]);
  const ocultos = corte.grupos.length - visibles.length;

  return (
    <section className="card p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-display text-[15px] font-semibold text-ink-900">
          {DIMENSION_LABEL[corte.dimension]}
        </h3>
        <span className="text-xs text-ink-500">{corte.grupos.length}</span>
      </div>

      {corte.sumaMasQueElTotal ? (
        /*
          SE DICE, NO SE ESCONDE. Una formacion puede responder a varias normas —alturas cuenta para
          SST y para BASC— asi que los totales por norma suman mas que el universo. Sin este aviso,
          alguien intentaria cuadrar los numeros y no podria, y acabaria desconfiando de los dos.
        */
        <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-paper px-3 py-2 text-xs leading-relaxed text-ink-500">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span>
            Una formacion puede responder a varias normas, asi que estas filas suman mas que las{' '}
            {universo} obligaciones reales.
          </span>
        </p>
      ) : null}

      <ul className="mt-3 space-y-3">
        {visibles.map((grupo) => (
          <li key={grupo.id ?? `sin-valor-${corte.dimension}`}>
            <div className="flex items-baseline justify-between gap-3">
              <p className={cn('truncate text-sm', grupo.id ? 'text-ink-900' : 'italic text-ink-500')}>
                {grupo.label}
              </p>
              <p className="shrink-0 text-sm font-semibold tabular-nums text-ink-900">
                {grupo.resumen.avancePct}%
                <span className="ml-1.5 text-xs font-normal text-ink-500">
                  {grupo.resumen.terminadas}/{grupo.resumen.total}
                </span>
              </p>
            </div>
            <div className="mt-1.5">
              <BarraEjecucion resumen={grupo.resumen} compacta />
            </div>
          </li>
        ))}
      </ul>

      {ocultos > 0 ? (
        <button
          type="button"
          onClick={() => setTodos(true)}
          className="focus-ring mt-3 rounded-md text-xs font-medium text-ink-500 hover:text-ink-900"
        >
          Ver {ocultos} mas
        </button>
      ) : null}
    </section>
  );
}
