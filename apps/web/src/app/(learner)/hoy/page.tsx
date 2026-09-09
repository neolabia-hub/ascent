'use client';

import {
  ArrowRight,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Clock,
  Hourglass,
  Play,
  Repeat2,
  Sparkles,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ApiError } from '@/lib/api';
import { getPending, getTodayReview, selfEnroll, type PendingItem, type TodayReview } from '@/lib/learner-api';
import { ActivityCover } from '@/components/modules/activity-cover';
import { cn } from '@/components/ui/cn';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { estadoVisual } from './estado-visual';

/**
 * HOY: una BIBLIOTECA, no una lista de tareas (Decision #89).
 *
 * DE DONDE VIENE. Esto era una lista de pendientes en tarjetas. Correcta y triste: la pantalla a
 * la que un auxiliar de bodega entra cada dia parecia un formulario de deberes. Nadie abre por
 * gusto una lista de obligaciones; todo el mundo abre una biblioteca. El contenido es el mismo, lo
 * que cambia es si da ganas de entrar.
 *
 * ─── LOS FILTROS PASARON A SER POR TIPO (Decision #103) ───
 *
 * Estaban por ESTADO —en curso, vence pronto, sin empezar— y el razonamiento era bueno: la
 * pregunta de quien entra a las seis de la mañana es "¿que hago hoy?", no "¿de que tema es?".
 * Se probo y falla por una razon practica que el razonamiento no veia: **las filas ya responden a
 * esa pregunta**. La primera es "Sigue donde ibas" y la segunda "Para esta semana", asi que el
 * filtro de estado no llevaba a ninguna parte nueva — solo escondia el resto de la pantalla.
 *
 * El TIPO si lleva a algo que no se puede conseguir mirando: "ensename solo lo de Alturas", que es
 * como la gente habla de su formacion y como la nombra el certificado que le piden. Un filtro debe
 * dar acceso a algo que la pagina no ofrece ya sola.
 *
 * EL FONDO NO TRAE COLOR PROPIO. La primera version pintaba esta pantalla oscura siempre, con su
 * paleta aparte: se veia bien y estaba mal —el modo aprendiz ya tiene claro y oscuro—. Lo
 * cinematografico lo pone la PORTADA con su degradado, que es una foto y funciona igual sobre
 * blanco que sobre negro.
 */

const TODOS = '__todos__';

export default function TodayPage() {
  const [pending, setPending] = useState<PendingItem[] | null>(null);
  const [review, setReview] = useState<TodayReview | null>(null);
  const [tipo, setTipo] = useState<string>(TODOS);

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

  /** Los tipos que esta persona TIENE, con su color. Nunca el catalogo entero de la empresa. */
  const tipos = useMemo(() => {
    const mapa = new Map<string, { nombre: string; color: string | null; cuantos: number }>();
    for (const item of pending ?? []) {
      const nombre = item.type?.name ?? 'Otras';
      const previo = mapa.get(nombre);
      mapa.set(nombre, {
        nombre,
        color: item.type?.colorHex ?? null,
        cuantos: (previo?.cuantos ?? 0) + 1,
      });
    }
    return [...mapa.values()].sort((a, b) => b.cuantos - a.cuantos);
  }, [pending]);

  const filtrados = useMemo(() => {
    const todos = pending ?? [];
    if (tipo === TODOS) return todos;
    return todos.filter((item) => (item.type?.name ?? 'Otras') === tipo);
  }, [pending, tipo]);

  /**
   * LAS FILAS ORDENAN POR LO QUE APRIETA, que es lo que el filtro ya no hace.
   *
   * "Esperando convocatoria" va LA ULTIMA y separada: no es tarea de esta persona, y ponerla
   * arriba mezclada con lo que si puede hacer es lo que producia la sensacion de tener mucho
   * pendiente cuando en realidad no dependia de ella.
   */
  const filas = useMemo(() => {
    const salida: Array<{ clave: string; titulo: string; nota?: string; items: PendingItem[] }> = [];
    const de = (...estados: PendingItem['state'][]) => filtrados.filter((item) => estados.includes(item.state));

    const enCurso = de('EN_CURSO');
    const apremia = de('ATRASADA', 'PRONTO');
    const abiertas = de('ABIERTA');
    const esperando = de('ESPERANDO');

    if (enCurso.length > 0) salida.push({ clave: 'curso', titulo: 'Sigue donde ibas', items: enCurso });
    if (apremia.length > 0) salida.push({ clave: 'apremia', titulo: 'Para esta semana', items: apremia });
    if (abiertas.length > 0) salida.push({ clave: 'abiertas', titulo: 'Cuando puedas', items: abiertas });
    if (esperando.length > 0) {
      salida.push({
        clave: 'esperando',
        titulo: 'Todavía no las han abierto',
        nota: 'No depende de ti. Aparecen aquí para que sepas que vienen.',
        items: esperando,
      });
    }
    return salida;
  }, [filtrados]);

  if (pending === null) {
    return (
      <div className="min-h-screen bg-paper px-4 pt-6 sm:px-6">
        <Skeleton className="h-[320px] w-full rounded-3xl" />
        <div className="mt-8 flex gap-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-[260px] w-[260px] shrink-0 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  /*
    QUE ENTRA AL CARRUSEL DEL PROTAGONISTA, y por que (Decision #107).

    La pregunta correcta no es "¿que le ensenamos primero?" sino **"¿que deberia estar haciendo
    ahora mismo?"**. Solo dos cosas la contestan de verdad, y por eso solo dos entran:

      1. LO QUE YA EMPEZO. Terminar cuesta menos que arrancar, y una formacion abandonada a medias
         es el patron que mas mata la constancia. Ademas se puede enseñar cuanto lleva, que es el
         unico argumento que de verdad convence: "te faltan tres piezas".
      2. LO QUE APRIETA POR FECHA —atrasado o a punto de vencer—. Tiene consecuencia real: queda
         en el expediente que mira el auditor.

    LO QUE SE QUITO DE AQUI: las ABIERTAS sin urgencia. Estaban y las he sacado. Una formacion sin
    empezar y sin fecha encima no responde "¿que hago ahora?" —responde "¿que hay?"—, y para eso
    esta la biblioteca de abajo entera. Metidas en el heroe solo conseguian que el sitio reservado
    a lo que apremia dejara de significar que apremia: si ahi puede salir cualquier cosa, el heroe
    es un anuncio y no una recomendacion.

    Y UNA SOLA ABIERTA AL FINAL, la primera que haya. Ni ninguna ni todas: ninguna deja el
    carrusel vacio los dias buenos —cuando no hay nada empezado ni nada por vencer, que es
    exactamente el dia en que si conviene proponer algo— y todas lo convierten en un escaparate.
    Una es una sugerencia; cinco son un catalogo, y el catalogo ya esta abajo. Va la ULTIMA porque
    lo que apremia se ve antes que lo que se propone.

    TOPE DE CINCO. Se probo con tres —a la cuarta, en un carrusel automatico, ya nadie espera— y
    el cliente prefiere cinco: en una empresa donde alguien puede llevar cuatro formaciones a
    medias, cortar en tres esconde dos que si estaba haciendo. El coste real de la quinta es que
    tarda mas en volver a salir, no que se pierda: los puntos de abajo dejan ir directo.

    Solo ACCIONABLES: un heroe a pantalla completa con un boton que no se puede pulsar es la peor
    pieza posible, y ese era justo el caso de "vencio hace 3 dias / deben convocarte".
  */
  const apremiantes = [
    ...pending.filter((item) => item.state === 'EN_CURSO'),
    ...pending.filter((item) => item.state === 'ATRASADA' || item.state === 'PRONTO'),
  ];
  const unaAbierta = pending.find((item) => item.state === 'ABIERTA');
  const protagonistas = [...apremiantes, ...(unaAbierta ? [unaAbierta] : [])].slice(0, 5);

  const hayRepaso = review !== null && review.total > 0;

  if (pending.length === 0 && !hayRepaso) {
    return (
      <EmptyState
        icon={CircleCheck}
        title="Estas al día"
        description="No tienes formación pendiente. Cuando te asignen una, aparecera aquí y te avisamos."
      />
    );
  }

  return (
    <div className="min-h-screen bg-paper pb-16">
      {/*
        SIN HEROE cuando no hay nada empezado ni nada por vencer. No se rellena con la primera de
        la lista: un sitio reservado a lo que apremia, ocupado por algo que no apremia, enseña a la
        gente a ignorarlo. Sin el, la biblioteca empieza arriba y la pantalla se lee igual de bien.
      */}
      {protagonistas.length > 0 ? <Protagonista items={protagonistas} /> : null}

      <div className="px-4 sm:px-6">
        {tipos.length > 1 ? <FiltrosPorTipo tipos={tipos} activo={tipo} onChange={setTipo} total={pending.length} /> : null}

        {hayRepaso ? <FilaRepaso review={review} /> : null}

        {filas.length === 0 ? (
          <p className="py-16 text-center text-sm text-ink-300">
            Nada de ese tipo ahora mismo.
          </p>
        ) : (
          filas.map((fila) => <Fila key={fila.clave} titulo={fila.titulo} nota={fila.nota} items={fila.items} />)
        )}
      </div>
    </div>
  );
}

/**
 * LOS FILTROS, por tipo de formacion (Decision #103).
 *
 * Cada tipo lleva un PUNTO de su propio color —el mismo que usa en las tarjetas y en el indice del
 * reproductor—, no el color de la empresa: aqui el color no dice "elegido", dice "de que es". El
 * elegido se marca con relleno y con el borde, que es como se marca en el resto del producto.
 */
function FiltrosPorTipo({
  tipos,
  activo,
  onChange,
  total,
}: {
  tipos: Array<{ nombre: string; color: string | null; cuantos: number }>;
  activo: string;
  onChange: (valor: string) => void;
  total: number;
}) {
  return (
    <div className="rail -mx-4 mt-7 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" role="group" aria-label="Filtrar por tipo">
      <Chip label="Todo" cuantos={total} activo={activo === TODOS} onClick={() => onChange(TODOS)} />
      {tipos.map((tipo) => (
        <Chip
          key={tipo.nombre}
          label={tipo.nombre}
          color={tipo.color}
          cuantos={tipo.cuantos}
          activo={activo === tipo.nombre}
          onClick={() => onChange(tipo.nombre)}
        />
      ))}
    </div>
  );
}

function Chip({
  label,
  cuantos,
  color,
  activo,
  onClick,
}: {
  label: string;
  cuantos: number;
  color?: string | null;
  activo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={cn(
        'focus-ring inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition-all duration-150',
        activo
          ? 'border-transparent text-white shadow-btn'
          : 'border-line text-ink-700 shadow-btn-flat hover:-translate-y-px hover:border-line-strong',
      )}
      /*
        EL INACTIVO TAMBIEN LLEVA TONO (Decision #107), un 5% del color de la empresa: sobre papel,
        una pastilla blanca con borde de 1px casi no se distinguia del fondo y la fila de filtros
        se leia como texto suelto. Un tono muy bajo la convierte en un objeto sin competir con el
        activo, que va a color pleno — la diferencia entre los dos sigue siendo enorme.
      */
      style={
        activo
          ? { backgroundColor: 'var(--brand-primary)' }
          : { backgroundColor: 'color-mix(in srgb, var(--brand-primary) 5%, var(--surface))' }
      }
    >
      {color ? (
        <span
          aria-hidden="true"
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: activo ? 'rgb(255 255 255 / 0.85)' : color }}
        />
      ) : null}
      {label}
      <span className="tabular-nums opacity-60">{cuantos}</span>
    </button>
  );
}

/**
 * EL PROTAGONISTA, con carrusel en el mismo sitio (Decision #103).
 *
 * MAS BAJO QUE ANTES (320/380 en vez de 380/440). Ocupaba toda la altura util de un telefono, asi
 * que al entrar no se veia que hubiera nada mas: la biblioteca empezaba por debajo del borde y
 * habia que descubrirla desplazando a ciegas. Ahora asoma la primera fila, que es lo que dice
 * "sigue hacia abajo" sin ningun texto que lo pida.
 *
 * Se PASA SOLO cada 7 segundos y se PARA al pasar el raton o al enfocar con el teclado: leer un
 * titulo mientras se va es de las cosas que mas molestan, y quien esta decidiendo esta parado
 * encima. No se reanuda al salir si la persona toco un punto: eligio, y cambiarselo seria
 * ignorarla.
 */
function Protagonista({ items }: { items: PendingItem[] }) {
  const [indice, setIndice] = useState(0);
  const [detenido, setDetenido] = useState(false);
  const [elegido, setElegido] = useState(false);

  useEffect(() => {
    if (items.length < 2 || detenido || elegido) return;
    const id = window.setInterval(() => setIndice((valor) => (valor + 1) % items.length), 7000);
    return () => window.clearInterval(id);
  }, [items.length, detenido, elegido]);

  const actual = items[Math.min(indice, items.length - 1)];
  if (!actual) return null;

  return (
    <section
      className="relative mx-4 sm:mx-6"
      onMouseEnter={() => setDetenido(true)}
      onMouseLeave={() => setDetenido(false)}
      onFocusCapture={() => setDetenido(true)}
      onBlurCapture={() => setDetenido(false)}
    >
      {/* `key` fuerza la entrada en cada cambio: sin ella la foto se sustituye de golpe. */}
      <Heroe key={actual.assignmentId} item={actual} />

      {items.length > 1 ? (
        <div className="absolute bottom-4 right-5 flex items-center gap-1.5 sm:bottom-6 sm:right-8">
          {items.map((item, posicion) => (
            <button
              key={item.assignmentId}
              type="button"
              onClick={() => {
                setIndice(posicion);
                setElegido(true);
              }}
              aria-label={`Ver ${item.title}`}
              aria-current={posicion === indice}
              /*
                Barritas y no puntos: una barra puede alargarse para marcar la activa, y asi la
                actual se distingue por FORMA y no solo por opacidad —que sobre una foto clara
                puede no verse—.
              */
              className={cn(
                'focus-ring h-1.5 rounded-full transition-all duration-300 ease-pulse',
                posicion === indice ? 'w-7 bg-white' : 'w-2.5 bg-white/45 hover:bg-white/70',
              )}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function Heroe({ item }: { item: PendingItem }) {
  const { abrir, cargando } = useAbrir(item);
  const visual = estadoVisual(item);

  return (
    <div className="stage-in relative isolate min-h-[320px] overflow-hidden rounded-[1.75rem] sm:min-h-[380px] sm:rounded-[2rem]">
      <ActivityCover
        seed={item.activityId}
        colorHex={item.type?.colorHex}
        coverKey={item.coverKey}
        variant="wide"
        className="absolute inset-0 h-full w-full rounded-none [aspect-ratio:auto]"
      />
      {/*
        LOS DOS DEGRADADOS, ALIGERADOS (Decision #107). Estaban en 85% y 70% y entre los dos se
        comian la foto: quedaba una imagen apagada de la que no se distinguia el asunto, que es
        justo lo que el heroe existe para enseñar.

        Bajan a 72% y 45%, y el vertical arranca mas arriba (`via-black/25` al 45% de la altura)
        para que la parte de en medio —donde la foto tiene su tema— quede casi limpia y lo oscuro
        se concentre abajo, que es donde va el texto.

        No se puede quitar del todo: el titulo es blanco y tiene que leerse sobre una foto
        cualquiera, incluida una de bodega con luz de mediodia. Lo que hay que oscurecer es la
        franja del texto, no la imagen.
      */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-black/72 via-black/25 to-transparent"
        style={{ backgroundImage: 'linear-gradient(to top, rgb(0 0 0 / 0.72) 0%, rgb(0 0 0 / 0.3) 38%, transparent 72%)' }}
      />
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-black/45 via-black/10 to-transparent" />

      <div className="relative flex min-h-[320px] max-w-2xl flex-col justify-end p-5 pb-14 sm:min-h-[380px] sm:p-8 sm:pb-16">
        <div className="flex flex-wrap items-center gap-2">
          {item.type ? (
            <span className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
              {item.type.name}
            </span>
          ) : null}
          <span className={cn('rounded-full px-3 py-1 text-xs font-semibold backdrop-blur-sm', visual.chipSobreFoto)}>
            {item.stateLabel}
          </span>
          {item.estimatedMinutes ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold text-white backdrop-blur-sm">
              <Clock className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              {item.estimatedMinutes} min
            </span>
          ) : null}
        </div>

        <h1 className="mt-4 font-display text-[28px] font-bold leading-[1.08] text-white sm:text-[40px]">
          {item.title}
        </h1>
        {item.description ? (
          <p className="mt-2.5 line-clamp-2 max-w-xl text-[15px] leading-relaxed text-white/75">{item.description}</p>
        ) : null}

        {/*
          CUANTO LLEVA, solo en lo empezado (Decision #107).

          Es el argumento que de verdad hace volver: "te falta poco" convence mas que cualquier
          recordatorio de que existe una obligacion. En lo que no se ha empezado no se pinta —una
          barra a cero es un cero grande y no anima a nadie— y en lo que no aplica tampoco.

          EL RELLENO VA EN EL COLOR SECUNDARIO DE LA EMPRESA (Decision #109), no en el principal
          y no en blanco.

          El PRINCIPAL no vale aqui aunque sea el color de "lo activo" en todo el producto: el de
          Transprensa es un azul muy oscuro, y sobre la franja oscura del degradado desaparece —una
          barra de progreso que no se ve es una barra que no existe—. La regla del sistema es que
          el color del tenant marca lo elegido; la regla de encima es que sobre una foto tiene que
          leerse, y esta gana.

          El SECUNDARIO si: es claro por definicion en las dos marcas que hemos visto, y ademas es
          el color con el que este producto ya habla de avance propio —la racha, los puntos, el
          repaso—. Blanco era la alternativa segura y no dice de quien es la plataforma.
        */}
        {item.state === 'EN_CURSO' && item.progressPct !== null ? (
          <div className="mt-4 max-w-sm">
            <div className="flex items-center justify-between text-xs font-semibold text-white/80">
              <span>Tu avance</span>
              <span className="tabular-nums">{item.progressPct}%</span>
            </div>
            <div
              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/25"
              role="progressbar"
              aria-valuenow={item.progressPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Avance de ${item.title}`}
            >
              <div
                className="h-full rounded-full transition-[width] duration-700 ease-pulse"
                style={{ width: `${item.progressPct}%`, backgroundColor: 'var(--brand-accent)' }}
              />
            </div>
          </div>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={cargando}
            onClick={() => void abrir()}
            /*
              Blanco y no del color de la empresa: va encima de una foto cualquiera, y el blanco es
              lo unico que se lee igual sobre todas. El HALO si es del color de la empresa
              (.btn-glow): lo despega del fondo sin robarle contraste al texto.
            */
            className="btn-glow focus-ring inline-flex h-12 items-center gap-2 rounded-xl bg-surface px-6 text-base font-semibold text-ink-900 transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
          >
            <Play className="h-4 w-4 fill-current" strokeWidth={0} aria-hidden="true" />
            {item.state === 'EN_CURSO' ? 'Continuar' : 'Empezar ahora'}
          </button>
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-white/80">
            <Sparkles className="h-4 w-4" strokeWidth={2} aria-hidden="true" />+{item.pointsOnComplete} pts
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * UNA FILA del catalogo. Se desplaza con el dedo en el telefono y con las flechas en escritorio.
 *
 * Las flechas aparecen solo al pasar por encima y SOLO en pantallas con raton: en un telefono
 * ocupan sitio y no las usa nadie, porque ahi ya se arrastra.
 */
function Fila({ titulo, nota, items }: { titulo: string; nota?: string; items: PendingItem[] }) {
  const rail = useRef<HTMLDivElement | null>(null);

  const mover = (direccion: -1 | 1) => {
    const nodo = rail.current;
    if (!nodo) return;
    nodo.scrollBy({ left: direccion * Math.max(280, nodo.clientWidth * 0.8), behavior: 'smooth' });
  };

  return (
    <section className="group/fila mt-9">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold text-ink-900">{titulo}</h2>
          {nota ? <p className="mt-0.5 text-xs text-ink-500">{nota}</p> : null}
        </div>
        <div className="hidden shrink-0 gap-1 opacity-0 transition-opacity group-hover/fila:opacity-100 md:flex">
          {[-1, 1].map((direccion) => (
            <button
              key={direccion}
              type="button"
              onClick={() => mover(direccion as -1 | 1)}
              aria-label={`Desplazar "${titulo}" hacia ${direccion === -1 ? 'atras' : 'adelante'}`}
              className="focus-ring flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface text-ink-700 transition-colors hover:border-line-strong hover:text-ink-900"
            >
              {direccion === -1 ? (
                <ChevronLeft className="h-5 w-5" strokeWidth={1.75} />
              ) : (
                <ChevronRight className="h-5 w-5" strokeWidth={1.75} />
              )}
            </button>
          ))}
        </div>
      </div>

      <div ref={rail} className="rail -mx-4 flex gap-3.5 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        {items.map((item, indice) => (
          <Tarjeta key={item.assignmentId} item={item} indice={indice} />
        ))}
      </div>
    </section>
  );
}

/**
 * LA TARJETA (Decision #102). Portada arriba, datos abajo y UN BOTON DE VERDAD.
 *
 * ─── QUE CAMBIO Y POR QUE ───
 *
 * 1. **El pie era un renglon de texto con una flecha** ("Empezar →") y la tarjeta entera era el
 *    boton. Funcionaba con raton y mal con el dedo: no habia nada con forma de boton, asi que en
 *    el telefono no se sabia donde tocar ni si habia pasado algo. Ahora hay un boton con borde,
 *    que ademas es lo que pidio el cliente.
 * 2. **La portada hace zoom lento al pasar.** Es el gesto que dice "esto se abre" sin anadir ni un
 *    elemento; en movil no existe y no hace falta, porque ahi ya se toca.
 * 3. **El estado vive SOBRE la portada**, no debajo mezclado con la fecha: es lo primero que hay
 *    que saber y lo unico que cambia de una tarjeta a otra de un vistazo.
 * 4. **NADA DE FILO A LA IZQUIERDA.** Se probo una barra de color en el canto para reconocer las
 *    que apremian sin leer, y el cliente la rechazo con razon: partia la tarjeta en dos y se leia
 *    como el borde roto de un recorte, no como un estado. Ademas era redundante — el distintivo
 *    sobre la portada ya lo dice, y con palabras.
 * 5. **Nada de rojo.** Ver `estado-visual.ts`.
 * 6. **ALTURA IDENTICA en todas.** Estaban desparejas entre filas: dentro de un carril flexible
 *    todas se estiran hasta la mas alta, asi que bastaba un titulo de dos lineas o una fila de
 *    datos que se partiera en dos para que la fila entera creciera —y la de al lado no—. Ahora el
 *    titulo tiene alto fijo y los datos NO se parten: una linea, y lo que no cabe se corta.
 *
 * Lo que NO cambio: sigue siendo ANCHA (260px) y no una caratula 2:3. En 150px no cabe mas que el
 * titulo, y aqui la decision no se toma por la imagen —una foto de bodega no distingue una
 * formacion de otra— sino por lo que dice al lado.
 */
function Tarjeta({ item, indice }: { item: PendingItem; indice: number }) {
  const { abrir, cargando } = useAbrir(item);
  const visual = estadoVisual(item);

  return (
    <article
      /*
        LA TARJETA FLOTA (Decision #107). Antes era un rectangulo con borde de 1px sobre el mismo
        papel del fondo: se leia como una celda de tabla y no como un objeto que se puede coger.
        Con sombra propia se despega del fondo, y al apuntarla sube y la sombra crece — que es lo
        que dice "esto se abre" sin escribirlo.
      */
      className={cn(
        'poster stage-in group/t relative flex w-[260px] shrink-0 flex-col overflow-hidden rounded-2xl border border-line bg-surface text-left shadow-card transition-shadow duration-200 hover:shadow-card-hover sm:w-[280px]',
        // Lo que no depende de esta persona se presenta mas apagado: sigue estando, no reclama.
        !item.actionable && 'opacity-[0.85]',
      )}
      style={{ animationDelay: `${Math.min(indice, 5) * 60}ms` }}
    >
      <div className="relative overflow-hidden">
        <ActivityCover
          seed={item.activityId}
          colorHex={item.type?.colorHex}
          coverKey={item.coverKey}
          variant="tile"
          className="w-full rounded-none transition-transform duration-500 ease-pulse group-hover/t:scale-[1.06]"
        />
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/45 to-transparent" />
        <span
          className={cn(
            'absolute bottom-2.5 left-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-btn-flat backdrop-blur-sm',
            visual.chip,
          )}
        >
          {item.state === 'ESPERANDO' ? <Hourglass className="h-3 w-3" strokeWidth={2} aria-hidden="true" /> : null}
          {item.stateLabel}
        </span>
      </div>

      <div className="flex flex-1 flex-col p-4">
        {item.type ? (
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.06em]"
            style={{ color: item.type.colorHex ?? 'var(--brand-primary)' }}
          >
            {item.type.name}
          </p>
        ) : null}
        <h3 className="mt-1 line-clamp-2 min-h-[2.6em] text-[15px] font-semibold leading-snug text-ink-900">
          {item.title}
        </h3>

        {/*
          UNA SOLA LINEA, sin `flex-wrap`. Partiendose en dos, esta fila hacia crecer la tarjeta y
          —dentro de un carril flexible— arrastraba a todas las de su fila con ella, que es por que
          unas filas salian mas altas que otras.
        */}
        <div className="mt-2.5 flex items-center gap-x-3 overflow-hidden whitespace-nowrap text-xs text-ink-500">
          {item.estimatedMinutes ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              {item.estimatedMinutes} min
            </span>
          ) : null}
          {/* La fecha en crudo, sin color: el juicio sobre ella ya lo dio el distintivo de arriba. */}
          {item.dueAt ? (
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
              {new Date(item.dueAt).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' })}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1 font-semibold" style={{ color: 'var(--brand-accent)' }}>
            <Sparkles className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />+{item.pointsOnComplete}
          </span>
        </div>

        {/*
          EL AVANCE, en fino y sin numero: aqui la tarjeta solo tiene que decir "vas por ahi". La
          cifra exacta va en el heroe, donde hay sitio para leerla sin apretar.

          AQUI SI VA EL COLOR PRINCIPAL, al reves que en el heroe: sobre superficie blanca el azul
          oscuro contrasta de sobra, y es el color que en este producto significa "esto es lo tuyo,
          activo". Encima de una foto no se veia y por eso alli manda el secundario.
        */}
        {item.state === 'EN_CURSO' && item.progressPct !== null ? (
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-paper" aria-hidden="true">
            <div
              className="h-full rounded-full transition-[width] duration-700 ease-pulse"
              style={{ width: `${item.progressPct}%`, backgroundColor: 'var(--brand-primary)' }}
            />
          </div>
        ) : null}

        {/* `mt-auto`: los botones quedan alineados entre tarjetas aunque los titulos midan distinto. */}
        <div className="mt-auto pt-3.5">
          {item.actionable ? (
            <button
              type="button"
              onClick={() => void abrir()}
              disabled={cargando}
              /*
                EN REPOSO, BORDE; AL APUNTAR LA TARJETA, RELLENO DE MARCA.

                En una fila hay veinte botones y si todos vinieran rellenos de color no destacaria
                ninguno —seria una pared de azul—. Con borde se leen como boton igual, y el que se
                esta mirando se enciende. El cambio lo dispara el hover de la TARJETA, no el del
                boton: la tarjeta entera es el objetivo, y obligar a apuntar a los 40px del boton
                seria peor de lo que habia.
              */
              className="focus-ring inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-line-strong bg-surface text-sm font-semibold text-ink-900 transition-colors duration-200 disabled:opacity-60 group-hover/t:border-transparent group-hover/t:bg-[var(--brand-primary)] group-hover/t:text-white"
            >
              {item.state === 'EN_CURSO' ? 'Continuar' : 'Empezar'}
              <ArrowRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            </button>
          ) : (
            // Ni boton apagado ni boton que miente: una linea que dice de quien se espera. Un
            // boton gris invita a pulsarlo y despues no hace nada, que es peor que no tenerlo.
            <p className="flex h-10 items-center justify-center rounded-xl bg-paper text-center text-xs leading-tight text-ink-500">
              Te avisamos cuando la abran
            </p>
          )}
        </div>
      </div>
    </article>
  );
}

/**
 * ABRIR UNA FORMACION. Tres caminos y uno solo por item, decididos por el estado del servidor.
 *
 * Vive aparte porque lo usan el heroe y la tarjeta, y antes estaba escrito dos veces con dos
 * mensajes de error distintos para el mismo fallo.
 */
function useAbrir(item: PendingItem) {
  const router = useRouter();
  const { showToast } = useToast();
  const [cargando, setCargando] = useState(false);

  async function abrir() {
    if (item.enrollmentId) {
      router.push(`/aprender/${item.enrollmentId}`);
      return;
    }
    if (!item.selfServiceOfferingId) {
      showToast({
        kind: 'info',
        title: 'Todavía no la han abierto',
        description: 'No depende de ti: te avisamos en cuanto te convoquen.',
      });
      return;
    }
    setCargando(true);
    try {
      const resultado = await selfEnroll(item.selfServiceOfferingId);
      router.push(`/aprender/${resultado.enrollmentId}`);
    } catch (error) {
      showToast({
        kind: 'danger',
        title:
          error instanceof ApiError && error.code === 'OFFERING_WINDOW_CLOSED'
            ? 'Esta formación no esta disponible hoy.'
            : 'No se pudo empezar la formación.',
      });
      setCargando(false);
    }
  }

  return { abrir, cargando };
}

/**
 * EL REPASO DEL DIA, con su propia forma.
 *
 * No es una formacion y no puede parecerlo: no tiene portada, no se "termina" y dura tres minutos.
 * Por eso es una banda ancha y no una tarjeta mas de la fila —si se disfrazara de formacion, la
 * persona esperaria empezar algo largo y no lo tocaria—.
 */
function FilaRepaso({ review }: { review: TodayReview }) {
  return (
    <a
      href="/repaso"
      className="group/rep focus-ring mt-9 flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 shadow-card transition-all duration-200 ease-pulse hover:-translate-y-0.5 hover:shadow-card-hover sm:p-5"
      style={{ boxShadow: '0 0 0 1px color-mix(in srgb, var(--brand-accent) 22%, transparent)' }}
    >
      <span
        aria-hidden="true"
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl transition-transform duration-500 ease-pulse group-hover/rep:rotate-180"
        style={{ backgroundColor: 'color-mix(in srgb, var(--brand-accent) 14%, transparent)' }}
      >
        {/* Gira al pasar: es el gesto de "volver a pasar por esto", que es el repaso. */}
        <Repeat2 className="h-6 w-6" strokeWidth={1.75} style={{ color: 'var(--brand-accent)' }} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: 'var(--brand-accent)' }}>
          Tres minutos
        </p>
        <p className="mt-0.5 font-display text-lg font-bold leading-tight text-ink-900">Tu repaso de hoy</p>
        <p className="mt-0.5 text-sm text-ink-500">
          {review.total === 1 ? '1 pregunta' : `${review.total} preguntas`} de lo que ya viste
        </p>
      </div>

      {/*
        LAS PREGUNTAS DIBUJADAS COMO FICHAS APILADAS. Convierte un numero en algo que se ve, y de
        un vistazo se sabe si es un momento o un rato. Mas de cinco no se dibujan —serian ruido— y
        el resto se dice con un numero.
      */}
      <div className="hidden items-center sm:flex" aria-hidden="true">
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
        className="btn-glow flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all duration-200 ease-pulse group-hover/rep:translate-x-1"
        // El repaso es del color secundario en todo el producto, asi que su halo tambien.
        style={{ backgroundColor: 'var(--brand-accent)', '--glow-color': 'var(--brand-accent)' } as CSSProperties}
      >
        <ArrowRight className="h-5 w-5 text-white" strokeWidth={2.25} aria-hidden="true" />
      </span>
    </a>
  );
}
