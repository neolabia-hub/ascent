'use client';

import {
  ArrowRight,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock,
  Play,
  Repeat2,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ApiError } from '@/lib/api';
import { describeDueDate } from '@/lib/format';
import { getPending, getTodayReview, selfEnroll, type PendingItem, type TodayReview } from '@/lib/learner-api';
import { ActivityCover } from '@/components/modules/activity-cover';
import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';

/**
 * HOY: una BIBLIOTECA, no una lista de tareas (Decision #89).
 *
 * DE DONDE VIENE. Esto era una lista de pendientes en tarjetas. Correcta y triste: la pantalla a
 * la que un auxiliar de bodega entra cada dia parecia un formulario de deberes, y lo dijo el
 * cliente en una frase —*"quiero que hoy sea estilo streaming tipo Netflix"*—. Detras de esa
 * frase hay algo real: nadie abre por gusto una lista de obligaciones, pero todo el mundo abre
 * una biblioteca. El contenido es el mismo; lo que cambia es si da ganas de entrar.
 *
 * POR QUE FUNCIONA AQUI y no es solo maquillaje: la formacion de esta empresa YA tiene la forma
 * de un catalogo —piezas cortas, con portada, agrupadas por tema y con una que conviene ver
 * ahora—. Lo unico que faltaba era enseñarla asi.
 *
 * LOS FILTROS SON POR ESTADO Y NO POR TIPO, y es la decision de fondo de la pantalla. "Induccion"
 * o "Alturas" es como lo clasifica quien la administra; la pregunta de quien entra a las 6 de la
 * manana con el celular en la mano es OTRA: *"¿que hago hoy?"*. Por eso arriba se filtra por lo
 * que decide —vence pronto, ya empezado, sin empezar— y el TIPO se usa mas abajo, para agrupar
 * las filas, que es donde clasificar si ayuda a encontrar.
 *
 * EL FONDO NO TRAE COLOR PROPIO. La primera version pintaba esta pantalla oscura siempre, con su
 * paleta aparte. Se veia bien y estaba mal: el modo aprendiz ya tiene claro y oscuro, y una
 * pantalla que se los salta deja el producto con dos criterios. Ademas ponia una superficie de
 * color donde el resto usa neutros —y el azul y el verde de la empresa son ACENTO, no fondo—.
 *
 * Lo cinematografico lo pone la PORTADA a sangre con su degradado, que es una foto: funciona
 * igual sobre blanco que sobre negro, y por eso el texto que va encima si es blanco.
 */

type Filtro = 'TODO' | 'EMPEZADO' | 'URGENTE' | 'NUEVO';

/** Vence hoy, manana o ya vencio: es lo que de verdad aprieta. */
function urge(item: PendingItem): boolean {
  if (item.overdue) return true;
  if (!item.dueAt) return false;
  const dias = Math.round((new Date(item.dueAt).getTime() - Date.now()) / 86_400_000);
  return dias <= 2;
}

export default function TodayPage() {
  const [pending, setPending] = useState<PendingItem[] | null>(null);
  const [review, setReview] = useState<TodayReview | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('TODO');

  useEffect(() => {
    let cancelled = false;
    void getPending()
      .then((response) => {
        if (!cancelled) setPending(response.items);
      })
      .catch(() => {
        if (!cancelled) setPending([]);
      });
    void getTodayReview()
      .then((response) => {
        if (!cancelled) setReview(response);
      })
      .catch(() => {
        if (!cancelled) setReview(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtrados = useMemo(() => {
    const todos = pending ?? [];
    if (filtro === 'EMPEZADO') return todos.filter((item) => item.started);
    if (filtro === 'URGENTE') return todos.filter(urge);
    if (filtro === 'NUEVO') return todos.filter((item) => !item.started);
    return todos;
  }, [pending, filtro]);

  /**
   * LAS FILAS. Primero las que responden "¿que hago ahora?" y despues el catalogo por tema, que
   * es donde el tipo si ayuda: agrupa lo que se parece entre si.
   */
  const filas = useMemo(() => {
    const salida: Array<{ clave: string; titulo: string; items: PendingItem[] }> = [];
    const empezadas = filtrados.filter((item) => item.started);
    const urgentes = filtrados.filter((item) => !item.started && urge(item));
    const resto = filtrados.filter((item) => !item.started && !urge(item));

    if (empezadas.length > 0) salida.push({ clave: 'empezadas', titulo: 'Continua donde ibas', items: empezadas });
    if (urgentes.length > 0) salida.push({ clave: 'urgentes', titulo: 'Vence pronto', items: urgentes });

    // Por tema: una fila por tipo de formacion, con el nombre que usa la empresa.
    const porTipo = new Map<string, PendingItem[]>();
    for (const item of resto) {
      const nombre = item.type?.name ?? 'Otras formaciones';
      porTipo.set(nombre, [...(porTipo.get(nombre) ?? []), item]);
    }
    for (const [nombre, items] of porTipo) {
      salida.push({ clave: `tipo-${nombre}`, titulo: nombre, items });
    }
    return salida;
  }, [filtrados]);

  if (pending === null) {
    return (
      <div className="min-h-screen bg-paper px-4 pt-6 sm:px-6">
        <Skeleton className="h-[380px] w-full rounded-3xl" />
        <div className="mt-8 flex gap-3">
          <Skeleton className="h-[240px] w-[170px] shrink-0 rounded-2xl" />
          <Skeleton className="h-[240px] w-[170px] shrink-0 rounded-2xl" />
          <Skeleton className="h-[240px] w-[170px] shrink-0 rounded-2xl" />
        </div>
      </div>
    );
  }

  const hero = pending.find((item) => item.started) ?? pending.find(urge) ?? pending[0] ?? null;
  const hayRepaso = review !== null && review.total > 0;

  if (!hero && !hayRepaso) {
    return (
      <EmptyState
        icon={CircleCheck}
        title="Estas al dia"
        description="No tienes formacion pendiente. Cuando te asignen una, aparecera aqui y te avisamos."
      />
    );
  }

  return (
    // Se sale de los margenes del contenedor para que el heroe llegue al borde: un heroe con
    // margenes a los lados deja de ser un heroe y pasa a ser una tarjeta grande.
    <div className="min-h-screen bg-paper pb-16">
      {hero ? <Heroe item={hero} /> : null}

      <div className="px-4 sm:px-6">
        {/* ─────────────── Filtros ─────────────── */}
        <div className="rail -mx-4 mt-7 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {(
            [
              { clave: 'TODO', label: 'Todo' },
              { clave: 'EMPEZADO', label: 'En curso' },
              { clave: 'URGENTE', label: 'Vence pronto' },
              { clave: 'NUEVO', label: 'Sin empezar' },
            ] as Array<{ clave: Filtro; label: string }>
          ).map((chip) => {
            const activo = filtro === chip.clave;
            const cuantos =
              chip.clave === 'TODO'
                ? pending.length
                : chip.clave === 'EMPEZADO'
                  ? pending.filter((item) => item.started).length
                  : chip.clave === 'URGENTE'
                    ? pending.filter(urge).length
                    : pending.filter((item) => !item.started).length;
            if (cuantos === 0 && chip.clave !== 'TODO') return null;
            return (
              <button
                key={chip.clave}
                type="button"
                aria-pressed={activo}
                onClick={() => setFiltro(chip.clave)}
                /*
                  EL ACTIVO LLEVA EL AZUL DE LA EMPRESA (Decision #92): el color del tenant marca
                  lo elegido, que es exactamente para lo que sirve un acento. Antes el activo era
                  negro —correcto y anonimo—: podia ser el filtro de cualquier producto.
                  El resto se quedan neutros a proposito: si todos llevaran color, ninguno
                  destacaria y el acento dejaria de senalar nada.
                */
                className={cn(
                  'focus-ring shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-all duration-150',
                  activo
                    ? 'text-white shadow-btn'
                    : 'border border-line bg-surface text-ink-500 hover:-translate-y-px hover:border-line-strong hover:text-ink-900',
                )}
                style={activo ? { backgroundColor: 'var(--brand-primary)' } : undefined}
              >
                {chip.label}
                {/* El numero evita el filtro que no lleva a ninguna parte. */}
                <span className="ml-1.5 tabular-nums opacity-60">{cuantos}</span>
              </button>
            );
          })}
        </div>

        {hayRepaso ? <FilaRepaso review={review} /> : null}

        {filas.length === 0 ? (
          <p className="py-16 text-center text-sm text-ink-300">
            Nada en este filtro. Prueba con &quot;Todo&quot;.
          </p>
        ) : (
          filas.map((fila) => <Fila key={fila.clave} titulo={fila.titulo} items={fila.items} />)
        )}
      </div>
    </div>
  );
}

/**
 * EL HEROE, a sangre. Una sola formacion: la que conviene hacer ahora.
 *
 * Se prefiere la EMPEZADA sobre la mas urgente, y no al reves: abandonar algo a medias es el
 * patron que mas mata la constancia, y terminar lo empezado cuesta menos que arrancar de cero.
 */
function Heroe({ item }: { item: PendingItem }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [starting, setStarting] = useState(false);

  const puedeEntrar = item.enrollmentId !== null;
  const puedeEmpezar = !puedeEntrar && item.selfServiceOfferingId !== null;

  const abrir = async () => {
    if (puedeEntrar) {
      router.push(`/aprender/${item.enrollmentId}`);
      return;
    }
    if (!item.selfServiceOfferingId) return;
    setStarting(true);
    try {
      const result = await selfEnroll(item.selfServiceOfferingId);
      router.push(`/aprender/${result.enrollmentId}`);
    } catch (error) {
      showToast({
        kind: 'danger',
        title:
          error instanceof ApiError && error.code === 'OFFERING_WINDOW_CLOSED'
            ? 'Esta formacion no esta disponible hoy.'
            : 'No se pudo empezar la formacion.',
      });
      setStarting(false);
    }
  };

  return (
    /*
      SIN CANTOS RECTOS. Iba a sangre absoluta y los cuatro angulos rectos lo hacian parecer un
      banner pegado encima de la pantalla en vez de una pieza del producto. Ahora respira por los
      lados y redondea fuerte: es la misma forma que tienen las tarjetas, solo que en grande.
    */
    <section className="stage-in relative isolate mx-4 min-h-[380px] overflow-hidden rounded-[1.75rem] sm:mx-6 sm:min-h-[440px] sm:rounded-[2rem]">
      <ActivityCover
        seed={item.activityId}
        colorHex={item.type?.colorHex}
        coverKey={item.coverKey}
        variant="wide"
        className="absolute inset-0 h-full w-full rounded-none [aspect-ratio:auto]"
      />
      {/*
        DOS degradados y no uno: el vertical asienta el texto sobre la imagen y el lateral deja
        sitio al bloque de la izquierda sin oscurecer la foto entera, que es lo que la aplanaria.
      */}
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/20 to-transparent" />

      <div className="relative flex min-h-[420px] max-w-2xl flex-col justify-end p-5 pb-8 sm:min-h-[460px] sm:p-8 sm:pb-10">
        <div className="flex flex-wrap items-center gap-2">
          {item.type ? (
            <span className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-white backdrop-blur-sm">
              {item.type.name}
            </span>
          ) : null}
          {/* La urgencia se pinta en rojo solo cuando lo es: si todo grita, nada avisa. */}
          <span
            className={cn(
              'rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] backdrop-blur-sm',
              item.overdue ? 'bg-danger text-white' : 'bg-white/15 text-white',
            )}
          >
            {describeDueDate(item.dueAt)}
          </span>
          {item.estimatedMinutes ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-white backdrop-blur-sm">
              <Clock className="h-3 w-3" strokeWidth={2.25} aria-hidden="true" />
              {item.estimatedMinutes} min
            </span>
          ) : null}
        </div>

        <h1 className="mt-4 font-display text-[30px] font-bold leading-[1.08] text-white sm:text-[44px]">
          {item.title}
        </h1>
        {item.description ? (
          <p className="mt-3 line-clamp-2 max-w-xl text-[15px] leading-relaxed text-white/75">{item.description}</p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2.5">
          {puedeEntrar || puedeEmpezar ? (
            <button
              type="button"
              disabled={starting}
              onClick={() => void abrir()}
              className="focus-ring inline-flex h-12 items-center gap-2 rounded-xl bg-surface px-6 text-base font-semibold text-ink-900 shadow-lg transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
            >
              <Play className="h-4 w-4 fill-current" strokeWidth={0} aria-hidden="true" />
              {item.started ? 'Continuar' : 'Empezar ahora'}
            </button>
          ) : (
            <p className="rounded-xl bg-white/10 px-4 py-3 text-sm text-white/75">
              Todavia no esta abierta. Quien programa la formacion debe convocarte.
            </p>
          )}
          {puedeEntrar ? (
            <Link
              href={`/aprender/${item.enrollmentId}`}
              className="focus-ring inline-flex h-12 items-center gap-2 rounded-xl border border-white/25 px-5 text-base font-medium text-white transition-colors hover:bg-white/10"
            >
              Ver que trae
              <ArrowRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/**
 * UNA FILA del catalogo. Se desplaza con el dedo en el telefono y con las flechas en escritorio.
 *
 * Las flechas aparecen solo al pasar por encima y SOLO en pantallas con raton: en un telefono
 * ocupan sitio y no las usa nadie, porque ahi ya se arrastra.
 */
function Fila({ titulo, items }: { titulo: string; items: PendingItem[] }) {
  const rail = useRef<HTMLDivElement | null>(null);

  const mover = (direccion: -1 | 1) => {
    const nodo = rail.current;
    if (!nodo) return;
    nodo.scrollBy({ left: direccion * Math.max(280, nodo.clientWidth * 0.8), behavior: 'smooth' });
  };

  return (
    <section className="group/fila mt-9">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-ink-900">{titulo}</h2>
        <div className="hidden gap-1 opacity-0 transition-opacity group-hover/fila:opacity-100 md:flex">
          <button
            type="button"
            onClick={() => mover(-1)}
            aria-label={`Desplazar "${titulo}" hacia atras`}
            className="focus-ring flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-ink-700 transition-colors hover:border-line-strong hover:text-ink-900"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={() => mover(1)}
            aria-label={`Desplazar "${titulo}" hacia adelante`}
            className="focus-ring flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-ink-700 transition-colors hover:border-line-strong hover:text-ink-900"
          >
            <ChevronRight className="h-5 w-5" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <div ref={rail} className="rail -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        {items.map((item, indice) => (
          <Poster key={item.assignmentId} item={item} indice={indice} />
        ))}
      </div>
    </section>
  );
}

/** Una formacion como caratula vertical: es la forma que la vista reconoce como "algo que ver". */
function Poster({ item, indice }: { item: PendingItem; indice: number }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [starting, setStarting] = useState(false);

  const abrir = async () => {
    if (item.enrollmentId) {
      router.push(`/aprender/${item.enrollmentId}`);
      return;
    }
    if (!item.selfServiceOfferingId) {
      showToast({ kind: 'warning', title: 'Todavia no esta abierta', description: 'Deben convocarte primero.' });
      return;
    }
    setStarting(true);
    try {
      const result = await selfEnroll(item.selfServiceOfferingId);
      router.push(`/aprender/${result.enrollmentId}`);
    } catch {
      showToast({ kind: 'danger', title: 'No se pudo empezar la formacion.' });
      setStarting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void abrir()}
      disabled={starting}
      /*
        TARJETA ANCHA, NO CARATULA ESTRECHA (Decision #90).

        La primera version era un poster 2:3 de 150 px, como el cartel de una pelicula. Se veia
        bien y no servia: en 150 px no cabe nada mas que el titulo, y aqui la decision no se toma
        por la imagen —una foto de bodega no distingue una formacion de otra— sino por lo que
        dice al lado: cuanto dura, cuando vence y que gano. Un cartel funciona cuando la portada
        ES el producto; aqui la portada solo lo identifica.

        Asi que la proporcion baja a 16/10 y la tarjeta se ensancha hasta donde el texto respira.
      */
      className="poster stage-in focus-ring w-[250px] shrink-0 overflow-hidden rounded-2xl border border-line bg-surface text-left disabled:opacity-60 sm:w-[280px]"
      style={{ animationDelay: `${Math.min(indice, 5) * 60}ms` }}
    >
      <div className="relative">
        <ActivityCover
          seed={item.activityId}
          colorHex={item.type?.colorHex}
          coverKey={item.coverKey}
          variant="tile"
          className="w-full rounded-none"
        />
        {item.started ? (
          <span
            className="absolute left-2.5 top-2.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            En curso
          </span>
        ) : item.overdue ? (
          <span className="absolute left-2.5 top-2.5 rounded-full bg-danger px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
            Vencida
          </span>
        ) : null}
      </div>

      <div className="p-3.5">
        {item.type ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.04em]" style={{ color: item.type.colorHex ?? 'var(--brand-primary)' }}>
            {item.type.name}
          </p>
        ) : null}
        <p className="mt-1 line-clamp-2 min-h-[2.6em] text-[15px] font-semibold leading-snug text-ink-900">
          {item.title}
        </p>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
          {item.estimatedMinutes ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              {item.estimatedMinutes} min
            </span>
          ) : null}
          <span className={cn('inline-flex items-center gap-1', item.overdue && 'font-medium text-danger')}>
            <CalendarClock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
            {describeDueDate(item.dueAt)}
          </span>
        </div>

        {/*
          LO QUE GANA, y es un numero VERDADERO: la constante vive en `shared` y es la misma que
          usa el servidor al otorgarlo (Decision #90). Prometer 50 y dar 30 seria peor que no
          prometer nada, asi que la promesa y el premio salen del mismo sitio.
        */}
        <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5">
          <span
            className="inline-flex items-center gap-1.5 text-xs font-semibold"
            style={{ color: 'var(--brand-accent)' }}
          >
            <Sparkles className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />+{item.pointsOnComplete} pts
          </span>
          <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-700">
            {item.started ? 'Continuar' : 'Empezar'}
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          </span>
        </div>
      </div>
    </button>
  );
}

/**
 * EL REPASO DEL DIA, con su propia forma.
 *
 * No es una formacion y no puede parecerlo: no tiene portada, no se "termina" y dura tres
 * minutos. Por eso es una banda ancha y no una caratula mas de la fila —si se disfrazara de
 * formacion, competiria con ellas por la misma decision y confundiria las dos cosas—.
 */
function FilaRepaso({ review }: { review: TodayReview }) {
  return (
    <Link
      href="/repaso"
      className="group/rep stage-in focus-ring relative mt-8 block overflow-hidden rounded-3xl border border-line bg-surface p-5 transition-all duration-200 ease-pulse hover:-translate-y-1 hover:shadow-card-hover sm:p-6"
    >
      {/*
        EL VERDE DE LA EMPRESA, como halo y no como fondo (Decision #92). Un relleno de color
        macizo compite con las portadas de las filas de abajo y ademas obliga a texto blanco, que
        en tema claro se lee peor. Un halo suave detras deja la tarjeta sobre superficie normal y
        aun asi la separa de todo lo demas: es la unica pieza de la pantalla que no es una
        formacion, y tiene que notarse.
      */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full opacity-60 blur-3xl transition-opacity duration-300 group-hover/rep:opacity-90"
        style={{ backgroundColor: 'color-mix(in srgb, var(--brand-accent) 30%, transparent)' }}
      />

      <div className="relative flex items-center gap-4">
        <span
          className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl transition-transform duration-300 ease-pulse group-hover/rep:scale-105"
          style={{ backgroundColor: 'color-mix(in srgb, var(--brand-accent) 16%, transparent)' }}
        >
          {/* Gira un poco al pasar: es el gesto de "volver a pasar por esto", que es el repaso. */}
          <Repeat2
            className="h-7 w-7 transition-transform duration-500 ease-pulse group-hover/rep:rotate-180"
            strokeWidth={1.75}
            style={{ color: 'var(--brand-accent)' }}
            aria-hidden="true"
          />
        </span>

        <div className="min-w-0 flex-1">
          <p
            className="text-[11px] font-bold uppercase tracking-[0.08em]"
            style={{ color: 'var(--brand-accent)' }}
          >
            Tres minutos
          </p>
          <p className="mt-0.5 font-display text-lg font-bold leading-tight text-ink-900">Tu repaso de hoy</p>
          <p className="mt-1 text-sm text-ink-500">
            {review.total} {review.total === 1 ? 'pregunta' : 'preguntas'} de lo que ya viste. Es lo que hace que no
            se te olvide.
          </p>
        </div>

        {/*
          LAS PREGUNTAS, COMO FICHAS APILADAS. Es lo que convierte un numero en algo que se ve: se
          entiende de un vistazo que son pocas y que se acaban rapido, que es justo lo que frena a
          alguien con cinco minutos. Mas de cinco no se dibujan —serian ruido— y el resto se dice
          con un "+N".
        */}
        <div className="hidden shrink-0 items-center sm:flex" aria-hidden="true">
          {Array.from({ length: Math.min(review.total, 5) }).map((_, indice) => (
            <span
              key={indice}
              className="-ml-2 h-9 w-7 rounded-md border border-line bg-paper transition-transform duration-300 ease-pulse first:ml-0"
              style={{
                transform: `rotate(${(indice - 2) * 4}deg)`,
                zIndex: indice,
                transitionDelay: `${indice * 40}ms`,
              }}
            />
          ))}
          {review.total > 5 ? (
            <span className="ml-1.5 text-sm font-semibold tabular-nums text-ink-500">+{review.total - 5}</span>
          ) : null}
        </div>

        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all duration-200 ease-pulse group-hover/rep:translate-x-1"
          style={{ backgroundColor: 'var(--brand-accent)' }}
        >
          <ArrowRight className="h-5 w-5 text-white" strokeWidth={2.25} aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
}
