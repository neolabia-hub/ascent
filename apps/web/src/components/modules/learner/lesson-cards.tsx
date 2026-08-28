'use client';

import { Check, RotateCw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { mediaUrl } from '@/lib/catalog-api';
import type { CardPayload } from '@/lib/learner-api';
import { cn } from '@/components/ui/cn';

/**
 * Las seis tarjetas de la Fase 1 (CLAUDE.md 3.5), dibujadas para LEER.
 *
 * Cambio de fondo (2026-08-27): antes iban sobre negro a pantalla completa, el patron "stories".
 * Se paso a una pagina calida y con aire. El motivo no es estetico: una tarjeta de formacion hay
 * que entenderla, no consumirla en dos segundos, y el formato de red social empuja justo a lo
 * contrario. Ademas el negro a plena pantalla cansa a los tres minutos.
 *
 * El QUIZ de una leccion es REFUERZO, no nota: se responde, se dice si estuvo bien y se sigue.
 * Por eso su respuesta correcta si viaja al cliente, al contrario que la de un examen.
 */

export interface CardViewProps {
  payload: CardPayload;
  /** La tarjeta avisa cuando ya se puede avanzar (quiz respondido, huecos llenos). */
  onInteracted: () => void;
}

export function LessonCardView({ payload, onInteracted }: CardViewProps) {
  switch (payload.cardType) {
    case 'TEXT_IMAGE':
      return <TextImageCard payload={payload} />;
    case 'VIDEO_SHORT':
      return <VideoShortCard payload={payload} />;
    case 'FLIP':
      return <FlipCard payload={payload} />;
    case 'QUIZ':
      return <QuizCard payload={payload} onInteracted={onInteracted} />;
    case 'POLL':
      return <PollCard payload={payload} onInteracted={onInteracted} />;
    case 'FILL_GAP':
      return <FillGapCard payload={payload} onInteracted={onInteracted} />;
  }
}

/** Solo QUIZ y PALABRA FALTANTE exigen responder antes de seguir; el resto se lee y se pasa. */
export function requiresInteraction(payload: CardPayload): boolean {
  return payload.cardType === 'QUIZ' || payload.cardType === 'FILL_GAP';
}

/** Titular de tarjeta: grande y con aire. Es lo que ancla la lectura. */
function CardTitle({ children }: { children: string }) {
  return (
    <h2
      className="mb-5 font-display text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] lg:text-[34px]"
      style={{ color: 'var(--reading-ink)' }}
    >
      {children}
    </h2>
  );
}

/** Rotulo pequeno que dice de que tipo es la tarjeta, en voz baja. */
function CardKicker({ children }: { children: string }) {
  return (
    <p
      className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em]"
      style={{ color: 'var(--reading-muted)' }}
    >
      {children}
    </p>
  );
}

function TextImageCard({ payload }: { payload: Extract<CardPayload, { cardType: 'TEXT_IMAGE' }> }) {
  return (
    <div>
      {payload.title ? <CardTitle>{payload.title}</CardTitle> : null}
      {payload.mediaKey ? (
        <figure className="mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mediaUrl(payload.mediaKey)}
            alt={payload.caption ?? ''}
            className="w-full rounded-xl object-cover"
            style={{ maxHeight: '46vh' }}
          />
          {payload.caption ? (
            <figcaption className="mt-2.5 text-sm" style={{ color: 'var(--reading-muted)' }}>
              {payload.caption}
            </figcaption>
          ) : null}
        </figure>
      ) : null}
      <p className="reading-body whitespace-pre-line">{payload.body}</p>
    </div>
  );
}

function VideoShortCard({ payload }: { payload: Extract<CardPayload, { cardType: 'VIDEO_SHORT' }> }) {
  const embed = payload.externalUrl ? toEmbedUrl(payload.externalUrl) : null;
  return (
    <div>
      {payload.title ? <CardTitle>{payload.title}</CardTitle> : null}
      {payload.mediaKey ? (
        <video src={mediaUrl(payload.mediaKey)} controls playsInline className="w-full rounded-xl bg-black" />
      ) : embed ? (
        <div className="aspect-video w-full overflow-hidden rounded-xl bg-black">
          <iframe
            src={embed}
            title={payload.title ?? 'Video'}
            className="h-full w-full"
            allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        </div>
      ) : payload.externalUrl ? (
        <a
          href={payload.externalUrl}
          target="_blank"
          rel="noreferrer"
          className="focus-ring block rounded-xl border px-4 py-3 underline"
          style={{ borderColor: 'var(--reading-line)', color: 'var(--reading-ink)' }}
        >
          Ver el video
        </a>
      ) : null}
    </div>
  );
}

function FlipCard({ payload }: { payload: Extract<CardPayload, { cardType: 'FLIP' }> }) {
  const [flipped, setFlipped] = useState(false);

  useEffect(() => {
    setFlipped(false);
  }, [payload.front]);

  return (
    <div>
      <CardKicker>Para pensarlo un segundo</CardKicker>
      <button
        type="button"
        onClick={() => setFlipped((value) => !value)}
        aria-label={flipped ? 'Ver la pregunta' : 'Ver la respuesta'}
        className="focus-ring w-full rounded-2xl border p-8 text-left transition-shadow duration-200 ease-pulse hover:shadow-card lg:p-10"
        style={{ borderColor: 'var(--reading-line)' }}
      >
        <p
          key={flipped ? 'back' : 'front'}
          className="reading-enter font-display text-[22px] font-medium leading-snug lg:text-[26px]"
          style={{ color: 'var(--reading-ink)' }}
        >
          {flipped ? payload.back : payload.front}
        </p>
        <span
          className="mt-6 inline-flex items-center gap-2 text-sm"
          style={{ color: 'var(--reading-muted)' }}
        >
          <RotateCw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          {flipped ? 'Volver a la pregunta' : 'Toca para ver la respuesta'}
        </span>
      </button>
    </div>
  );
}

/** Opcion de respuesta: area grande, letra al principio, estado claro al revelarse. */
function Option({
  letter,
  text,
  state,
  disabled,
  onClick,
}: {
  letter: string;
  text: string;
  state: 'idle' | 'chosen' | 'correct' | 'wrong';
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'focus-ring flex min-h-[60px] w-full items-center gap-4 rounded-xl border px-4 py-3.5 text-left transition-all duration-150 ease-pulse',
        state === 'idle' && 'hover:-translate-y-px hover:shadow-card',
        disabled && state === 'idle' && 'opacity-55',
      )}
      style={{
        borderColor:
          state === 'correct' ? 'var(--ok)' : state === 'wrong' ? 'var(--danger)' : state === 'chosen' ? 'var(--brand-primary)' : 'var(--reading-line)',
        backgroundColor:
          state === 'correct' ? 'var(--ok-soft)' : state === 'wrong' ? 'var(--danger-soft)' : state === 'chosen' ? 'var(--brand-primary-soft)' : 'transparent',
      }}
    >
      <span
        aria-hidden="true"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold"
        style={{
          backgroundColor: state === 'idle' ? 'var(--reading-line)' : 'transparent',
          color:
            state === 'correct' ? 'var(--ok)' : state === 'wrong' ? 'var(--danger)' : 'var(--reading-muted)',
        }}
      >
        {state === 'correct' ? (
          <Check className="h-4 w-4" strokeWidth={3} />
        ) : state === 'wrong' ? (
          <X className="h-4 w-4" strokeWidth={3} />
        ) : (
          letter
        )}
      </span>
      <span className="min-w-0 text-[17px] leading-snug" style={{ color: 'var(--reading-ink)' }}>
        {text}
      </span>
    </button>
  );
}

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

function QuizCard({
  payload,
  onInteracted,
}: {
  payload: Extract<CardPayload, { cardType: 'QUIZ' }>;
  onInteracted: () => void;
}) {
  const [chosen, setChosen] = useState<string | null>(null);
  const correct = chosen === payload.correctOptionId;

  useEffect(() => {
    setChosen(null);
  }, [payload.question]);

  return (
    <div>
      <CardKicker>Comprueba lo que entendiste</CardKicker>
      <CardTitle>{payload.question}</CardTitle>

      <ul className="space-y-3">
        {payload.options.map((option, position) => {
          const isChosen = chosen === option.id;
          const isCorrect = option.id === payload.correctOptionId;
          const state =
            chosen === null ? 'idle' : isCorrect ? 'correct' : isChosen ? 'wrong' : 'idle';
          return (
            <li key={option.id}>
              <Option
                letter={LETTERS[position] ?? '?'}
                text={option.text}
                state={state}
                disabled={chosen !== null}
                onClick={() => {
                  if (chosen) return;
                  setChosen(option.id);
                  onInteracted();
                }}
              />
            </li>
          );
        })}
      </ul>

      {chosen ? (
        <p
          className="reading-enter mt-6 rounded-xl px-4 py-3.5 text-[17px] leading-relaxed"
          style={{
            backgroundColor: correct ? 'var(--ok-soft)' : 'var(--warn-soft)',
            color: 'var(--reading-ink)',
          }}
        >
          {correct
            ? (payload.feedbackCorrect ?? 'Correcto.')
            : (payload.feedbackWrong ?? 'No era esa. La correcta esta marcada arriba.')}
        </p>
      ) : null}
    </div>
  );
}

function PollCard({
  payload,
  onInteracted,
}: {
  payload: Extract<CardPayload, { cardType: 'POLL' }>;
  onInteracted: () => void;
}) {
  const [chosen, setChosen] = useState<string | null>(null);

  useEffect(() => {
    setChosen(null);
  }, [payload.question]);

  return (
    <div>
      <CardKicker>No hay respuesta correcta</CardKicker>
      <CardTitle>{payload.question}</CardTitle>
      <ul className="space-y-3">
        {payload.options.map((option, position) => (
          <li key={option.id}>
            <Option
              letter={LETTERS[position] ?? '?'}
              text={option.text}
              state={chosen === option.id ? 'chosen' : 'idle'}
              onClick={() => {
                setChosen(option.id);
                onInteracted();
              }}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * PALABRA FALTANTE. Se toca una palabra del banco y cae en el siguiente hueco; tocar un hueco
 * lleno lo vacia. Arrastrar seria mas bonito y mucho peor con guantes puestos.
 */
function FillGapCard({
  payload,
  onInteracted,
}: {
  payload: Extract<CardPayload, { cardType: 'FILL_GAP' }>;
  onInteracted: () => void;
}) {
  const segments = payload.sentence.split('___');
  const gapCount = segments.length - 1;
  const [filled, setFilled] = useState<Array<string | null>>(() => Array.from({ length: gapCount }, () => null));

  useEffect(() => {
    setFilled(Array.from({ length: gapCount }, () => null));
  }, [payload.sentence, gapCount]);

  const bank = [...payload.answers, ...payload.distractors].sort((a, b) => a.localeCompare(b, 'es'));
  const used = new Set(filled.filter((word): word is string => word !== null));
  const complete = filled.every((word) => word !== null);
  const allCorrect = complete && filled.every((word, position) => word === payload.answers[position]);

  function place(word: string) {
    const next = [...filled];
    const target = next.findIndex((slot) => slot === null);
    if (target === -1) return;
    next[target] = word;
    setFilled(next);
    if (next.every((slot) => slot !== null)) onInteracted();
  }

  return (
    <div>
      <CardKicker>Completa la frase</CardKicker>

      <p className="text-[22px] leading-[2] lg:text-[26px]" style={{ color: 'var(--reading-ink)' }}>
        {segments.map((segment, position) => (
          <span key={`${segment}-${position}`}>
            {segment}
            {position < gapCount ? (
              <button
                type="button"
                onClick={() => {
                  const next = [...filled];
                  next[position] = null;
                  setFilled(next);
                }}
                disabled={filled[position] === null}
                className="focus-ring mx-1.5 inline-flex min-h-[42px] min-w-[110px] items-center justify-center rounded-lg border-2 px-3 align-middle text-[19px]"
                style={{
                  borderStyle: filled[position] === null ? 'dashed' : 'solid',
                  borderColor: complete
                    ? allCorrect
                      ? 'var(--ok)'
                      : 'var(--danger)'
                    : filled[position] === null
                      ? 'var(--reading-line)'
                      : 'var(--brand-primary)',
                  backgroundColor: complete ? (allCorrect ? 'var(--ok-soft)' : 'var(--danger-soft)') : 'transparent',
                  color: filled[position] === null ? 'var(--reading-muted)' : 'var(--reading-ink)',
                }}
              >
                {filled[position] ?? ' '}
              </button>
            ) : null}
          </span>
        ))}
      </p>

      <ul className="mt-8 flex flex-wrap gap-2.5">
        {bank.map((word) => (
          <li key={word}>
            <button
              type="button"
              disabled={used.has(word)}
              onClick={() => place(word)}
              className="focus-ring min-h-[46px] rounded-full border px-5 text-[17px] transition-all duration-150 ease-pulse hover:-translate-y-px hover:shadow-card disabled:translate-y-0 disabled:opacity-25 disabled:shadow-none"
              style={{ borderColor: 'var(--reading-line)', color: 'var(--reading-ink)' }}
            >
              {word}
            </button>
          </li>
        ))}
      </ul>

      {complete ? (
        <p
          className="reading-enter mt-6 rounded-xl px-4 py-3.5 text-[17px]"
          style={{
            backgroundColor: allCorrect ? 'var(--ok-soft)' : 'var(--warn-soft)',
            color: 'var(--reading-ink)',
          }}
        >
          {allCorrect ? 'Asi es.' : 'Revisa: toca un hueco para vaciarlo y vuelve a intentarlo.'}
        </p>
      ) : null}
    </div>
  );
}

/** YouTube y Vimeo solo se dejan embeber por su URL de reproductor. */
function toEmbedUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('youtube.com')) {
      const id = parsed.searchParams.get('v');
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (parsed.hostname === 'youtu.be') {
      return `https://www.youtube.com/embed/${parsed.pathname.slice(1)}`;
    }
    if (parsed.hostname.includes('vimeo.com')) {
      return `https://player.vimeo.com/video/${parsed.pathname.split('/').filter(Boolean)[0]}`;
    }
    return null;
  } catch {
    return null;
  }
}
