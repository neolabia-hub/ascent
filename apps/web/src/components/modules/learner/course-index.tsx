'use client';

import { useEffect, useRef, useState } from 'react';

import {
  Check,
  ClipboardCheck,
  FileText,
  Layers,
  Link2,
  Lock,
  MessageSquareText,
  Package,
  Presentation,
  Video,
  type LucideIcon,
} from 'lucide-react';
import { toScore, type ContentType, type EnrollmentContent, type LessonCard, type OpenEnrollment } from '@/lib/learner-api';
import { cn } from '@/components/ui/cn';

/**
 * INDICE DE LA FORMACION — el panel de la derecha del reproductor.
 *
 * Responde de un vistazo la pregunta que uno se hace a mitad de una formacion, que no es "cuantas
 * tarjetas quedan de esto" sino "cuanto me falta para terminar". Por eso muestra la formacion
 * ENTERA con el estado de cada parte, y despliega solo la que se esta cursando.
 *
 * Cada renglon dice TRES cosas antes de entrar, y las tres importan a quien tiene veinte minutos
 * entre turno y turno:
 *  - QUE es (icono y rotulo del tipo: no es lo mismo un video que un examen que consume intento);
 *  - CUANTO es, en la unidad del tipo — 8 tarjetas, 11 diapositivas, 5 min. No se inventan
 *    minutos donde no los hay: de un video subido no se conoce la duracion hasta reproducirlo, y
 *    un numero redondo inventado es peor que no decir nada;
 *  - COMO va: hecho, en curso, empezado a medias o todavia cerrado.
 *
 * Dos reglas de navegacion, y las dos protegen la evidencia:
 *  - a otra PARTE solo se salta si ya se completo, o es la siguiente que toca. El servidor valida
 *    la secuencia de todos modos, pero la interfaz no debe invitar a saltarsela;
 *  - a otra TARJETA de la parte actual, solo hacia lo ya visto.
 */

interface TypeMeta {
  icon: LucideIcon;
  label: string;
}

const TYPES: Record<ContentType, TypeMeta> = {
  LESSON: { icon: Layers, label: 'Lección' },
  PRESENTATION: { icon: Presentation, label: 'Presentacion' },
  VIDEO: { icon: Video, label: 'Video' },
  DOCUMENT: { icon: FileText, label: 'Documento de apoyo' },
  ASSESSMENT: { icon: ClipboardCheck, label: 'Evaluación' },
  SURVEY: { icon: MessageSquareText, label: 'Encuesta' },
  SCORM: { icon: Package, label: 'Paquete' },
  LINK: { icon: Link2, label: 'Recurso externo' },
};

/** El renglon de debajo del titulo: que es y cuanto es, con lo que de verdad se sabe. */
export function contentMeta(content: EnrollmentContent, passingScore?: number): string {
  const parts: string[] = [TYPES[content.type]?.label ?? 'Contenido'];

  if (content.size.cards) parts.push(`${content.size.cards} ${content.size.cards === 1 ? 'tarjeta' : 'tarjetas'}`);
  if (content.size.slides) {
    parts.push(`${content.size.slides} ${content.size.slides === 1 ? 'diapositiva' : 'diapositivas'}`);
  }
  if (content.size.minutes) parts.push(`${content.size.minutes} min`);
  if (content.type === 'ASSESSMENT' && passingScore) parts.push(`nota minima ${passingScore}%`);
  if (!content.isRequired) parts.push('opcional');

  return parts.join(' · ');
}

/**
 * Anillo de avance en los tokens de la superficie de lectura (el de la biblioteca es del admin).
 *
 * LATE al subir, que es la microinteraccion de la marca (skill pulse-ui, Firma 1): terminar una
 * parte tiene que notarse en algun sitio, y el sitio es el numero que mide lo que llevas. Late al
 * SUBIR y no en cada render: si latiera siempre, dejaria de significar nada.
 */
function ReadingRing({ value, size = 46 }: { value: number; size?: number }) {
  const previous = useRef(value);
  const [beating, setBeating] = useState(false);

  useEffect(() => {
    if (value > previous.current) {
      setBeating(true);
      const timeout = window.setTimeout(() => setBeating(false), 320);
      previous.current = value;
      return () => window.clearTimeout(timeout);
    }
    previous.current = value;
  }, [value]);

  const clamped = Math.max(0, Math.min(100, value));
  const stroke = 4;
  const radius = size / 2 - stroke / 2 - 1;
  const circumference = 2 * Math.PI * radius;

  return (
    <div
      className={cn('relative inline-flex shrink-0 items-center justify-center', beating && 'animate-pulse-ring')}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--reading-line)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--brand-accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (clamped / 100) * circumference}
          style={{ transition: 'stroke-dashoffset 320ms cubic-bezier(.2,.8,.2,1)' }}
        />
      </svg>
      <span className="absolute font-display text-[11px] font-semibold tabular-nums" style={{ color: 'var(--reading-ink)' }}>
        {Math.round(clamped)}
      </span>
    </div>
  );
}

export function CourseIndex({
  course,
  currentContentId,
  cards,
  index,
  furthest,
  onJumpCard,
  onJumpContent,
  presentacion = 'carril',
}: {
  course: OpenEnrollment | null;
  currentContentId: string;
  cards: LessonCard[];
  index: number;
  furthest: number;
  onJumpCard: (target: number) => void;
  onJumpContent: (contentId: string) => void;
  /**
   * DOS SITIOS, EL MISMO CONTENIDO.
   *
   * `carril` es la columna de 340px de la derecha, que en escritorio esta siempre ahi.
   * `hoja` es el cajon que se despliega en telefono, donde una columna fija no cabe.
   *
   * Se hace con una variante y no con dos componentes porque lo que se enseña es exactamente lo
   * mismo —el anillo, las partes, las tarjetas de la parte actual y a donde se puede saltar—; lo
   * unico que cambia es el envoltorio. Dos componentes serian dos sitios donde corregir la misma
   * regla de "a que partes se deja saltar", que es la clase de duplicado que se separa sola.
   */
  presentacion?: 'carril' | 'hoja';
}) {
  if (!course) return null;

  const total = course.contents.length;
  const done = course.contents.filter((content) => content.status === 'COMPLETED').length;
  const donePct = total === 0 ? 0 : Math.round((done / total) * 100);
  const nextId = course.contents.find((content) => content.status !== 'COMPLETED')?.id;

  const cuerpo = (
    <>
      {/* Cabecera fija: el avance no se pierde al bajar por una formacion larga. */}
      <div
        className="flex shrink-0 items-center gap-3.5 border-b px-5 py-4"
        style={{ borderColor: 'var(--reading-line)' }}
      >
        <ReadingRing value={donePct} />
        <div className="min-w-0">
          <p className="font-display text-sm font-semibold" style={{ color: 'var(--reading-ink)' }}>
            Contenido
          </p>
          <p className="text-xs" style={{ color: 'var(--reading-muted)' }}>
            <span className="tabular-nums">{done}</span> de <span className="tabular-nums">{total}</span> partes
            completadas
          </p>
        </div>
      </div>

      <ol className="scroll-hidden min-h-0 flex-1 overflow-y-auto p-3">
        {course.contents.map((content, position) => (
          <IndexRow
            key={content.id}
            content={content}
            position={position}
            passingScore={toScore(course.enrollment.passingScore) ?? undefined}
            isCurrent={content.id === currentContentId}
            reachable={content.status === 'COMPLETED' || content.id === nextId || content.id === currentContentId}
            cards={content.id === currentContentId ? cards : []}
            cardIndex={index}
            furthest={furthest}
            onJumpCard={onJumpCard}
            onJumpContent={onJumpContent}
          />
        ))}
      </ol>
    </>
  );

  // En el cajon del telefono el envoltorio ya lo pone el armazon: aqui solo se apila.
  if (presentacion === 'hoja') {
    return <div className="flex h-full min-h-0 flex-col">{cuerpo}</div>;
  }

  return (
    <aside
      className="hidden w-[340px] shrink-0 flex-col border-l lg:flex"
      style={{ borderColor: 'var(--reading-line)' }}
    >
      {cuerpo}
    </aside>
  );
}

function IndexRow({
  content,
  position,
  passingScore,
  isCurrent,
  reachable,
  cards,
  cardIndex,
  furthest,
  onJumpCard,
  onJumpContent,
}: {
  content: EnrollmentContent;
  position: number;
  passingScore?: number;
  isCurrent: boolean;
  reachable: boolean;
  cards: LessonCard[];
  cardIndex: number;
  furthest: number;
  onJumpCard: (target: number) => void;
  onJumpContent: (contentId: string) => void;
}) {
  const completed = content.status === 'COMPLETED';
  const started = !completed && content.pct > 0;
  const Icon = TYPES[content.type]?.icon ?? Layers;

  return (
    <li>
      <button
        type="button"
        disabled={!reachable}
        onClick={() => (isCurrent ? undefined : onJumpContent(content.id))}
        aria-current={isCurrent ? 'step' : undefined}
        className={cn(
          'focus-ring relative flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-150 ease-pulse',
          isCurrent ? '' : reachable ? 'reading-row' : 'cursor-not-allowed',
        )}
        style={isCurrent ? { backgroundColor: 'color-mix(in srgb, var(--brand-primary) 10%, transparent)' } : undefined}
      >
        {/* La marca de "aqui estas": una barra de acento pegada al borde del renglon. */}
        {isCurrent ? (
          <span
            aria-hidden="true"
            className="absolute left-0 top-1/2 h-8 w-[3px] -translate-y-1/2 rounded-r-full"
            style={{ backgroundColor: 'var(--brand-accent)' }}
          />
        ) : null}

        {/*
          El icono dice de que TIPO es la pieza; el estado se pinta sobre el mismo cuadro en vez
          de en una segunda columna, para que el renglon no se llene de simbolos.
        */}
        <span
          className={cn(
            'mt-px flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] transition-colors duration-150',
            !reachable && 'opacity-40',
          )}
          style={{
            /*
             * El COMPLETADO es verde y el ACTUAL es el color primario del tenant, nunca los dos
             * del mismo tono: si el que estas viendo se pinta igual que los ya hechos, el indice
             * deja de responder de un vistazo lo unico que se le pide.
             */
            backgroundColor: completed
              ? 'color-mix(in srgb, var(--ok) 16%, transparent)'
              : isCurrent
                ? 'var(--brand-primary)'
                : 'color-mix(in srgb, var(--reading-ink) 6%, transparent)',
            color: completed ? 'var(--ok)' : isCurrent ? '#ffffff' : 'var(--reading-muted)',
          }}
        >
          {completed ? (
            <Check className="h-[18px] w-[18px]" strokeWidth={2.5} aria-hidden="true" />
          ) : !reachable ? (
            <Lock className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          ) : (
            <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
          )}
        </span>

        <span className={cn('min-w-0 flex-1', !reachable && 'opacity-40')}>
          <span
            className={cn('block text-sm leading-snug', isCurrent ? 'font-medium' : '')}
            style={{ color: 'var(--reading-ink)' }}
          >
            <span className="tabular-nums" style={{ color: 'var(--reading-muted)' }}>
              {String(position + 1).padStart(2, '0')}
            </span>{' '}
            {content.title}
          </span>
          <span className="mt-0.5 block text-xs" style={{ color: 'var(--reading-muted)' }}>
            {contentMeta(content, passingScore)}
          </span>

          {/*
            Solo se dibuja la barra de lo empezado y sin terminar. En lo completado sobra (ya lo
            dice el visto) y en lo no empezado seria una barra vacia repetida en toda la lista.
          */}
          {started ? (
            <span className="mt-2 flex items-center gap-2">
              <span
                className="h-1 flex-1 overflow-hidden rounded-full"
                style={{ backgroundColor: 'var(--reading-line)' }}
              >
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${content.pct}%`, backgroundColor: 'var(--brand-accent)' }}
                />
              </span>
              <span className="text-[11px] tabular-nums" style={{ color: 'var(--reading-muted)' }}>
                {content.pct}%
              </span>
            </span>
          ) : null}
        </span>
      </button>

      {/* La parte que se esta cursando se despliega con sus tarjetas, colgando de una guia. */}
      {isCurrent && cards.length > 0 ? (
        <ol className="ml-[30px] mt-1 space-y-px border-l pl-3" style={{ borderColor: 'var(--reading-line)' }}>
          {cards.map((card, position2) => {
            const seen = position2 <= furthest;
            const active = position2 === cardIndex;
            return (
              <li key={card.id}>
                <button
                  type="button"
                  disabled={!seen}
                  onClick={() => onJumpCard(position2)}
                  className={cn(
                    'focus-ring flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs transition-colors duration-150',
                    active ? 'font-medium' : seen ? 'reading-row' : 'cursor-not-allowed',
                  )}
                  style={{ color: active ? 'var(--reading-ink)' : 'var(--reading-muted)', opacity: seen ? 1 : 0.4 }}
                >
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor: active
                        ? 'var(--brand-accent)'
                        : seen
                          ? 'var(--reading-muted)'
                          : 'var(--reading-line)',
                    }}
                  />
                  <span className="min-w-0 flex-1 truncate">{cardTitle(card)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : null}
    </li>
  );
}

/** Un rotulo corto para el indice: la tarjeta no siempre tiene titulo, pero siempre tiene algo. */
export function cardTitle(card: LessonCard): string {
  const payload = card.payload;
  switch (payload.cardType) {
    case 'TEXT_IMAGE':
      return payload.title || payload.body.slice(0, 60);
    case 'VIDEO_SHORT':
      return payload.title || 'Video';
    case 'QUIZ':
      return payload.question;
    case 'POLL':
      return payload.question;
    case 'FLIP':
      return payload.front;
    case 'FILL_GAP':
      return payload.sentence.replace(/___/g, '____');
  }
}
