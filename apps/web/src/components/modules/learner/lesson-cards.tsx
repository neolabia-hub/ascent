'use client';

import { Check, RotateCw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { mediaUrl } from '@/lib/catalog-api';
import type { CardPayload } from '@/lib/learner-api';
import { cn } from '@/components/ui/cn';

/**
 * Las seis tarjetas de la Fase 1 (CLAUDE.md 3.5), dibujadas para el REPRODUCTOR: fondo oscuro,
 * un solo foco por tarjeta, texto de 18-20 y nada mas en pantalla.
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

function CardTitle({ children }: { children: string }) {
  return <h2 className="mb-3 font-display text-xl font-semibold leading-tight text-white">{children}</h2>;
}

function TextImageCard({ payload }: { payload: Extract<CardPayload, { cardType: 'TEXT_IMAGE' }> }) {
  return (
    <div>
      {payload.title ? <CardTitle>{payload.title}</CardTitle> : null}
      {payload.mediaKey ? (
        <figure className="mb-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={mediaUrl(payload.mediaKey)}
            alt={payload.caption ?? ''}
            className="max-h-[38vh] w-full rounded-lg object-cover"
          />
          {payload.caption ? (
            <figcaption className="mt-2 text-sm text-white/60">{payload.caption}</figcaption>
          ) : null}
        </figure>
      ) : null}
      <p className="whitespace-pre-line text-lg leading-relaxed text-white/90">{payload.body}</p>
    </div>
  );
}

function VideoShortCard({ payload }: { payload: Extract<CardPayload, { cardType: 'VIDEO_SHORT' }> }) {
  const embed = payload.externalUrl ? toEmbedUrl(payload.externalUrl) : null;
  return (
    <div>
      {payload.title ? <CardTitle>{payload.title}</CardTitle> : null}
      {payload.mediaKey ? (
        <video src={mediaUrl(payload.mediaKey)} controls playsInline className="w-full rounded-lg" />
      ) : embed ? (
        <div className="aspect-video w-full overflow-hidden rounded-lg">
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
          className="focus-ring block rounded-lg border border-white/20 px-4 py-3 text-white underline"
        >
          Ver el video
        </a>
      ) : null}
    </div>
  );
}

function FlipCard({ payload }: { payload: Extract<CardPayload, { cardType: 'FLIP' }> }) {
  const [flipped, setFlipped] = useState(false);

  // Cada tarjeta nueva empieza por su cara frontal.
  useEffect(() => {
    setFlipped(false);
  }, [payload.front]);

  return (
    <button
      type="button"
      onClick={() => setFlipped((value) => !value)}
      aria-label={flipped ? 'Ver el frente' : 'Ver el reverso'}
      className="focus-ring flex min-h-[220px] w-full flex-col items-center justify-center gap-4 rounded-xl border border-white/15 bg-white/5 p-6 text-center"
    >
      <p className="text-lg leading-relaxed text-white">{flipped ? payload.back : payload.front}</p>
      <span className="inline-flex items-center gap-1.5 text-sm text-white/50">
        <RotateCw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        {flipped ? 'Volver' : 'Toca para ver la respuesta'}
      </span>
    </button>
  );
}

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

  function choose(optionId: string) {
    if (chosen) return;
    setChosen(optionId);
    onInteracted();
  }

  return (
    <div>
      <CardTitle>{payload.question}</CardTitle>
      <ul className="mt-4 space-y-3">
        {payload.options.map((option) => {
          const isChosen = chosen === option.id;
          const isCorrect = option.id === payload.correctOptionId;
          const reveal = chosen !== null && (isChosen || isCorrect);
          return (
            <li key={option.id}>
              <button
                type="button"
                disabled={chosen !== null}
                onClick={() => choose(option.id)}
                className={cn(
                  'focus-ring flex min-h-[56px] w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-base transition-colors duration-150 ease-pulse',
                  reveal && isCorrect && 'border-ok bg-ok/15 text-white',
                  reveal && !isCorrect && isChosen && 'border-danger bg-danger/15 text-white',
                  !reveal && 'border-white/20 bg-white/5 text-white/90',
                )}
              >
                {reveal ? (
                  isCorrect ? (
                    <Check className="h-5 w-5 shrink-0 text-ok" strokeWidth={2.5} aria-hidden="true" />
                  ) : (
                    <X className="h-5 w-5 shrink-0 text-danger" strokeWidth={2.5} aria-hidden="true" />
                  )
                ) : (
                  <span aria-hidden="true" className="h-5 w-5 shrink-0 rounded-full border-2 border-white/30" />
                )}
                <span className="min-w-0">{option.text}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {chosen ? (
        <p className={cn('mt-4 text-base', correct ? 'text-ok' : 'text-white/80')}>
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
      <CardTitle>{payload.question}</CardTitle>
      <p className="mb-4 text-sm text-white/50">No hay respuesta correcta: queremos tu opinion.</p>
      <ul className="space-y-3">
        {payload.options.map((option) => (
          <li key={option.id}>
            <button
              type="button"
              onClick={() => {
                setChosen(option.id);
                onInteracted();
              }}
              className={cn(
                'focus-ring flex min-h-[56px] w-full items-center rounded-lg border px-4 py-3 text-left text-base',
                chosen === option.id ? 'border-primary bg-primary/25 text-white' : 'border-white/20 bg-white/5 text-white/90',
              )}
            >
              {option.text}
            </button>
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

  function clear(position: number) {
    const next = [...filled];
    next[position] = null;
    setFilled(next);
  }

  return (
    <div>
      <CardTitle>Completa la frase</CardTitle>
      <p className="text-lg leading-loose text-white/90">
        {segments.map((segment, position) => (
          <span key={`${segment}-${position}`}>
            {segment}
            {position < gapCount ? (
              <button
                type="button"
                onClick={() => clear(position)}
                disabled={filled[position] === null}
                className={cn(
                  'focus-ring mx-1 inline-flex min-h-[36px] min-w-[84px] items-center justify-center rounded-md border px-2 align-middle text-base',
                  filled[position] === null
                    ? 'border-dashed border-white/40 text-white/40'
                    : complete && allCorrect
                      ? 'border-ok bg-ok/15 text-white'
                      : complete
                        ? 'border-danger bg-danger/15 text-white'
                        : 'border-white/40 bg-white/10 text-white',
                )}
              >
                {filled[position] ?? '_____'}
              </button>
            ) : null}
          </span>
        ))}
      </p>

      <ul className="mt-6 flex flex-wrap gap-2">
        {bank.map((word) => (
          <li key={word}>
            <button
              type="button"
              disabled={used.has(word)}
              onClick={() => place(word)}
              className="focus-ring min-h-[44px] rounded-full border border-white/20 bg-white/5 px-4 text-base text-white disabled:opacity-30"
            >
              {word}
            </button>
          </li>
        ))}
      </ul>

      {complete ? (
        <p className={cn('mt-5 text-base', allCorrect ? 'text-ok' : 'text-white/80')}>
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
