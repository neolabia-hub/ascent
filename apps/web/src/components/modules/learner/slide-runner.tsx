'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MediaImage } from '@/components/ui/media';
import { cn } from '@/components/ui/cn';

/**
 * REPRODUCTOR DE PRESENTACIONES.
 *
 * Una diapositiva a la vez, no un PDF embebido con su barra de herramientas. La diferencia no es
 * estetica: en un visor de PDF la persona hace scroll y la plataforma no sabe nada; aqui cada
 * diapositiva se pasa a mano, asi que se puede registrar cual vio, cuanto tiempo y hasta donde
 * llego. Eso es lo que convierte "subi la presentacion de la ARL" en evidencia.
 *
 * LA DIAPOSITIVA CABE SIEMPRE, sin scroll. Es la correccion del 2026-08-28: la imagen se pedia a
 * lo ancho (`w-full` con una proporcion fija), asi que una lamina apaisada en una columna ancha
 * calculaba mas alto que la ventana y habia que bajar para verla entera —justo lo que este
 * reproductor existe para evitar—. Ahora la caja manda y la imagen se ajusta DENTRO de ella.
 *
 * Se puede volver ATRAS libremente (una presentacion se relee) pero el porcentaje cuenta
 * diapositivas DISTINTAS vistas, no la posicion: ir y volver no infla nada, y saltar tampoco,
 * porque no hay forma de saltar.
 */

/** Ancho de la pista y de la previsualizacion, en px: hacen falta para acotarla a los bordes. */
const TRACK_WIDTH = 220;
const PEEK_WIDTH = 148;

export interface SlideRunnerProps {
  slides: Array<{ index: number; key: string; width: number; height: number }>;
  /** Porcentaje de diapositivas distintas vistas, 0-100. */
  onProgress: (pct: number, seenCount: number) => void;
  /** Se llama al pasar de la ultima. */
  onFinish: () => void;
  /** "Siguiente parte" o "Terminar": depende de si queda algo despues en la formacion. */
  finishLabel?: string;
  finishing?: boolean;
}

export function SlideRunner({
  slides,
  onProgress,
  onFinish,
  finishLabel = 'Terminar',
  finishing = false,
}: SlideRunnerProps) {
  const [index, setIndex] = useState(0);
  const [seen, setSeen] = useState<Set<number>>(() => new Set([0]));
  /** Hacia donde se movio la ultima vez: decide de que lado entra la lamina. */
  const [direction, setDirection] = useState<'next' | 'prev'>('next');
  /** Diapositiva bajo el cursor mientras se recorre la pista, para previsualizarla. */
  const [peek, setPeek] = useState<number | null>(null);
  const touchStartX = useRef<number | null>(null);

  const total = slides.length;
  const pct = useMemo(() => (total === 0 ? 0 : Math.round((seen.size / total) * 100)), [seen, total]);

  // El aviso al padre va en un efecto y no dentro del manejador del clic: asi se emite una vez por
  // cambio real, y no dos veces cuando el gesto y el boton disparan lo mismo.
  const report = useRef(onProgress);
  report.current = onProgress;
  useEffect(() => {
    report.current(pct, seen.size);
  }, [pct, seen.size]);

  const go = (target: number) => {
    if (target < 0 || target >= total) return;
    setDirection(target > index ? 'next' : 'prev');
    setIndex(target);
    setSeen((previous) => (previous.has(target) ? previous : new Set(previous).add(target)));
  };

  // Las flechas del teclado, porque esto es una presentacion y es lo que la gente intenta.
  const goRef = useRef(go);
  goRef.current = go;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      if (event.key === 'ArrowRight') goRef.current(index + 1);
      if (event.key === 'ArrowLeft') goRef.current(index - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index]);

  const slide = slides[index];
  if (!slide) return null;

  const isLast = index === total - 1;
  const trackPct = total <= 1 ? 100 : (index / (total - 1)) * 100;
  /** De una posicion horizontal a la diapositiva que le corresponde. */
  const indexAt = (clientX: number, box: DOMRect) =>
    Math.min(total - 1, Math.max(0, Math.round(((clientX - box.left) / box.width) * (total - 1))));

  return (
    <>
      <section
        className="group/stage relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4 py-4 lg:px-12"
        onTouchStart={(event) => {
          touchStartX.current = event.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => {
          const start = touchStartX.current;
          const end = event.changedTouches[0]?.clientX ?? null;
          touchStartX.current = null;
          if (start === null || end === null) return;
          if (start - end > 60) go(index + 1);
          if (end - start > 60) go(index - 1);
        }}
      >
        {/*
          La caja manda y la imagen se ajusta dentro: `max-h-full` y `max-w-full` sin ancho
          impuesto. Asi una lamina apaisada y una vertical caben las dos sin recortarse ni
          desbordar.
        */}
        <div
          key={slide.key}
          className={cn(
            'flex h-full w-full items-center justify-center',
            direction === 'next' ? 'animate-slide-next' : 'animate-slide-prev',
          )}
        >
          <MediaImage
            storageKey={slide.key}
            alt={`Diapositiva ${slide.index} de ${total}`}
            className="max-h-full max-w-full rounded-xl object-contain shadow-card"
          />
        </div>

        {/*
          FLECHAS SOBRE LA LAMINA, como en cualquier visor de presentaciones. Aparecen al acercar
          el raton para no competir con el contenido, y en tactil no estorban porque ahi se desliza.
        */}
        <StageArrow side="left" disabled={index === 0} onClick={() => go(index - 1)} />
        <StageArrow side="right" disabled={isLast} onClick={() => go(index + 1)} />

      </section>

      {/*
        UN SOLO MANDO, compacto y centrado bajo la lamina.
        Antes habia un boton de ancho completo para "Siguiente" y un riel aparte: mucho sitio para
        una accion que solo significa "pasa". Aqui la navegacion cabe en una pieza —atras, la
        posicion, adelante— y el boton grande reaparece SOLO al final, que es cuando hay algo
        importante que decidir: cerrar la parte.
      */}
      {/*
        UN SOLO MANDO, compacto y centrado bajo la lamina. Antes habia un boton de ancho completo
        para "Siguiente" y un riel aparte: mucho sitio para una accion que solo significa "pasa".

        La PISTA es continua y no una fila de tramos —con veinte diapositivas los tramos son rayas
        indistinguibles—, y para que se pueda encontrar UNA en concreto se previsualiza al pasar
        por encima: la lamina asoma sobre el cursor, como en el rebobinado de un video. Sin eso,
        una pista continua obliga a ir de una en una.

        Y el cierre no es un boton aparte: la flecha de avanzar SE CONVIERTE en el en la ultima
        lamina, dentro del mismo mando. Un segundo boton al lado competia con el primero.
      */}
      <footer className="flex shrink-0 items-center justify-center px-6 pb-6 pt-2 lg:px-10">
        <div
          className="relative flex h-[52px] items-center gap-1 rounded-full border px-2 shadow-card"
          style={{ borderColor: 'var(--reading-line)', backgroundColor: 'var(--reading-paper)' }}
        >
          <PillArrow side="left" disabled={index === 0} onClick={() => go(index - 1)} />

          <button
            type="button"
            aria-label="Ir a una diapositiva"
            onMouseMove={(event) => {
              const box = event.currentTarget.getBoundingClientRect();
              setPeek(indexAt(event.clientX, box));
            }}
            onMouseLeave={() => setPeek(null)}
            onClick={(event) => go(indexAt(event.clientX, event.currentTarget.getBoundingClientRect()))}
            className="focus-ring group/track relative mx-1 hidden h-[52px] items-center sm:flex"
            style={{ width: TRACK_WIDTH }}
          >
            <span
              className="block h-[3px] w-full rounded-full transition-all duration-150 group-hover/track:h-[5px]"
              style={{ backgroundColor: 'var(--reading-line)' }}
            />
            <span
              aria-hidden="true"
              className="absolute left-0 h-[3px] rounded-full transition-all duration-[260ms] ease-pulse group-hover/track:h-[5px]"
              style={{ width: `${trackPct}%`, backgroundColor: 'var(--brand-accent)' }}
            />
            <span
              aria-hidden="true"
              className="absolute h-3 w-3 -translate-x-1/2 rounded-full shadow-btn transition-all duration-[260ms] ease-pulse group-hover/track:scale-125"
              style={{ left: `${trackPct}%`, backgroundColor: 'var(--brand-accent)' }}
            />

            {/* La lamina que hay bajo el cursor, para encontrar una concreta sin ir pasando. */}
            {peek !== null && slides[peek] ? (
              /*
                La previsualizacion se ACOTA a los bordes de la pista. Centrada a secas, en la
                primera y en la ultima la mitad se salia y la lamina se veia estrecha y recortada:
                lo que fallaba no era el tamano, era que no cabia.
              */
              <span
                className="pointer-events-none absolute bottom-[46px] z-30 flex -translate-x-1/2 flex-col items-center gap-1"
                style={{
                  left: `${Math.min(
                    TRACK_WIDTH - PEEK_WIDTH / 2,
                    Math.max(PEEK_WIDTH / 2, total <= 1 ? TRACK_WIDTH / 2 : (peek / (total - 1)) * TRACK_WIDTH),
                  )}px`,
                }}
              >
                <span
                  className="block overflow-hidden rounded-lg border shadow-card-hover"
                  style={{ borderColor: 'var(--reading-line)', backgroundColor: 'var(--reading-paper)' }}
                >
                  <MediaImage
                    storageKey={slides[peek].key}
                    alt=""
                    className="block h-[104px] w-[148px] object-cover object-top"
                  />
                </span>
                <span
                  className="rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white"
                  style={{ backgroundColor: 'rgb(16 20 24 / 0.75)' }}
                >
                  {peek + 1}
                </span>
              </span>
            ) : null}
          </button>

          <span className="px-2 text-sm tabular-nums" style={{ color: 'var(--reading-muted)' }}>
            <span className="font-semibold" style={{ color: 'var(--reading-ink)' }}>
              {index + 1}
            </span>
            <span className="opacity-60"> / {total}</span>
          </span>

          {isLast ? (
            <button
              type="button"
              disabled={finishing}
              onClick={onFinish}
              className="focus-ring animate-unlock group/fin ml-1 flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium text-white shadow-btn transition-all duration-150 ease-pulse hover:-translate-y-px hover:shadow-btn-hover active:translate-y-0 active:shadow-btn-active disabled:opacity-60"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              {finishLabel}
              <ChevronRight
                className="h-4 w-4 transition-transform duration-150 ease-pulse group-hover/fin:translate-x-0.5"
                strokeWidth={2.25}
                aria-hidden="true"
              />
            </button>
          ) : (
            <PillArrow side="right" disabled={false} onClick={() => go(index + 1)} />
          )}
        </div>
      </footer>

      {isLast && seen.size < total ? (
        <p className="shrink-0 pb-4 text-center text-sm" style={{ color: 'var(--reading-muted)' }}>
          Te faltan {total - seen.size} diapositivas por ver
        </p>
      ) : null}

    </>
  );
}

/** Flecha del mando: redonda, discreta, y sin sitio propio cuando no lleva a ningun lado. */
function PillArrow({ side, disabled, onClick }: { side: 'left' | 'right'; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={side === 'left' ? 'Diapositiva anterior' : 'Diapositiva siguiente'}
      className={cn(
        'focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all duration-150 ease-pulse',
        disabled ? 'cursor-not-allowed opacity-25' : 'reading-row hover:scale-105 active:scale-95',
      )}
      style={{ color: 'var(--reading-ink)' }}
    >
      {side === 'left' ? (
        <ChevronLeft className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
      ) : (
        <ChevronRight className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
      )}
    </button>
  );
}

/** Flecha flotante sobre la lamina. Se desvanece cuando no hay a donde ir, no desaparece. */
function StageArrow({
  side,
  disabled,
  onClick,
}: {
  side: 'left' | 'right';
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-label={side === 'left' ? 'Diapositiva anterior' : 'Diapositiva siguiente'}
      /*
        Fondo OSCURO translucido y icono blanco, no el color del papel: una lamina es casi siempre
        blanca, y una flecha clara sobre fondo claro no se ve. Asi se lee igual sobre una portada
        en blanco que sobre una foto a sangre.
      */
      className={cn(
        'focus-ring absolute top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full text-white backdrop-blur-sm transition-all duration-150 ease-pulse lg:flex',
        side === 'left' ? 'left-4' : 'right-4',
        disabled
          ? 'cursor-not-allowed opacity-0'
          : 'opacity-0 shadow-btn group-hover/stage:opacity-90 hover:scale-110 hover:opacity-100',
      )}
      style={{ backgroundColor: 'rgb(16 20 24 / 0.55)' }}
    >
      {side === 'left' ? (
        <ChevronLeft className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
      ) : (
        <ChevronRight className="h-5 w-5" strokeWidth={2} aria-hidden="true" />
      )}
    </button>
  );
}
