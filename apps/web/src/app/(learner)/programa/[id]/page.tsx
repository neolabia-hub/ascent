'use client';

import { ArrowLeft, ArrowRight, Check, GraduationCap, Layers } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getMyPrograms, type MyProgram, type MyProgramModule } from '@/lib/programs-api';
import { ActivityCover } from '@/components/modules/activity-cover';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/empty-state';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Skeleton } from '@/components/ui/skeleton';

/** Mismo color fijo que en toda la interfaz de Programas: se reconoce sin leer la palabra. */
const COLOR_PROGRAMA = '#4338ca';

/**
 * FICHA DE UN PROGRAMA, del lado del aprendiz (2026-09-15) — a proposito con la MISMA forma que
 * la ficha de una formacion suelta (`/aprender/[enrollmentId]`, "pagina de titulo": portada, de
 * que va, avance, y las partes listadas como capitulos). Antes esto era una lista simple sin
 * contexto; un programa merece la misma cortesia que una formacion, no una version reducida.
 *
 * La diferencia real —la unica que justifica que sea OTRA pantalla— es que aqui las "partes" son
 * formaciones completas por su cuenta, asi que cada una lleva a SU PROPIA ficha
 * (`/formacion/[activityId]`) en vez de abrir directo un reproductor: un programa es un indice,
 * no un curso con contenido propio.
 */
export default function LearnerProgramPage() {
  const id = String(useParams().id ?? '');
  const [programas, setProgramas] = useState<MyProgram[] | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void getMyPrograms()
      .then((response) => {
        if (!cancelled) setProgramas(response);
      })
      .catch(() => {
        if (!cancelled) setProgramas(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (programas === undefined) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-56 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
    );
  }

  const programa = programas?.find((p) => p.id === id) ?? null;

  if (!programa) {
    return (
      <EmptyState
        icon={GraduationCap}
        title="Este programa ya no está entre los tuyos"
        description="Puede que se haya despublicado, o que ya no te lo exijan."
        action={
          <Link href="/mi-formacion" className="focus-ring text-sm text-ink-500 underline-offset-4 hover:underline">
            Ver mi formación
          </Link>
        }
      />
    );
  }

  const aprobados = programa.modulos.filter((m) => m.aprobado).length;
  const pct = programa.modulos.length === 0 ? 0 : Math.round((aprobados / programa.modulos.length) * 100);
  const siguiente = programa.modulos.find((m) => !m.aprobado) ?? null;
  const terminado = programa.estado === 'COMPLETED';

  return (
    <div>
      <Link
        href="/mi-formacion"
        className="focus-ring mb-4 inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-700"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        Volver a mi aprendizaje
      </Link>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-10">
        {/* Columna izquierda: de que va este programa. */}
        <section className="animate-card-in">
          <ActivityCover seed={programa.id} colorHex={COLOR_PROGRAMA} label="PROGRAMA" variant="wide" />

          <h1 className="mt-5 font-display text-[26px] font-semibold leading-tight text-ink-900 lg:text-[32px]">
            {programa.name}
          </h1>

          {programa.description ? <p className="mt-3 text-base leading-relaxed text-ink-500">{programa.description}</p> : null}

          <div className="mt-6 flex items-center gap-4 rounded-xl border border-line bg-surface p-5">
            <ProgressRing value={pct} size={64} pulse={pct === 100} />
            <div className="min-w-0">
              <p className="font-display text-base font-semibold text-ink-900">
                {aprobados} de {programa.modulos.length} {programa.modulos.length === 1 ? 'módulo' : 'módulos'}
              </p>
              <p className="mt-0.5 text-sm text-ink-500">
                {/*
                  UNA SOLA CONSTANCIA AL FINAL, dicho aqui y no solo al terminar (2026-09-15). Es
                  lo que distingue de verdad a un programa de una formacion suelta, y quien lo esta
                  cursando tiene que saberlo desde que entra, no descubrirlo al completar el
                  ultimo modulo.
                */}
                Una sola constancia al terminar todos
              </p>
            </div>
          </div>

          {terminado ? (
            <section className="mt-4 rounded-xl border border-ok/40 bg-ok-soft p-5 text-center">
              <Check className="mx-auto h-8 w-8 text-ok" strokeWidth={2} aria-hidden="true" />
              <h2 className="mt-2 font-display text-base font-semibold text-ok">Programa terminado</h2>
              <p className="mt-1 text-sm text-ink-700">Tu constancia del conjunto queda en tu expediente.</p>
            </section>
          ) : siguiente?.actividad ? (
            <Link href={`/formacion/${siguiente.actividad.id}`}>
              <Button size="lg" className="mt-4 w-full">
                {aprobados === 0 ? 'Empezar' : 'Continuar'}
                <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
              </Button>
            </Link>
          ) : null}
        </section>

        {/* Columna derecha: sus modulos, como capitulos — cada uno lleva a SU propia ficha. */}
        <section className="mt-8 lg:mt-0">
          <h2 className="mb-3 font-display text-lg font-semibold text-ink-900">Módulos</h2>
          <ol className="space-y-2">
            {programa.modulos.map((modulo, index) => (
              <ModuloFila key={modulo.id} modulo={modulo} indice={index} esSiguiente={modulo.id === siguiente?.id} />
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}

function ModuloFila({ modulo, indice, esSiguiente }: { modulo: MyProgramModule; indice: number; esSiguiente: boolean }) {
  const contenido = (
    <div
      className={cn(
        'flex w-full items-center gap-3 rounded-lg border bg-surface p-4 text-left transition-shadow duration-150 ease-pulse',
        esSiguiente ? 'border-primary shadow-card' : 'border-line hover:shadow-card',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-medium',
          modulo.aprobado ? 'bg-ok-soft text-ok' : 'bg-paper text-ink-500',
        )}
      >
        {modulo.aprobado ? <Check className="h-5 w-5" strokeWidth={2.5} /> : indice + 1}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-base text-ink-900">{modulo.actividad?.name ?? '(módulo eliminado)'}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-ink-500">
          <span className="inline-flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            {modulo.isRequired ? 'Obligatorio' : `Opcional${modulo.sectionName ? ` · ${modulo.sectionName}` : ''}`}
          </span>
        </span>
      </span>

      {esSiguiente ? (
        <span className="shrink-0 text-sm font-medium" style={{ color: 'var(--brand-primary)' }}>
          Seguir
        </span>
      ) : null}
    </div>
  );

  return (
    <li>
      {modulo.actividad ? (
        <Link href={`/formacion/${modulo.actividad.id}`} className="focus-ring block">
          {contenido}
        </Link>
      ) : (
        contenido
      )}
    </li>
  );
}
