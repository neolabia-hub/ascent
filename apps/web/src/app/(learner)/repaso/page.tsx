'use client';

import { CircleCheck, Repeat2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatDate } from '@/lib/format';
import {
  answerReview,
  getTodayReview,
  type AnswerInput,
  type ReviewResult,
  type TodayReview,
} from '@/lib/learner-api';
import { QuestionPrompt, hasAnswer } from '@/components/modules/learner/question-prompt';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { motivoDelError } from '@/lib/api';

/**
 * SESION DE REPASO DEL DIA (Decision #22). Trae de vuelta lo que se fallo, en escalones
 * 2-7-14-30, y no dura mas de tres minutos: el backend acota la cola a proposito.
 *
 * Se responde TODA la sesion y se entrega de una vez. Entregar pregunta por pregunta obligaria a
 * tener señal en cada toque, y esta pantalla existe justo para quien no la tiene.
 */
export default function ReviewPage() {
  const { showToast } = useToast();
  const [session, setSession] = useState<TodayReview | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerInput>>({});
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<ReviewResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTodayReview()
      .then((value) => {
        if (!cancelled) setSession(value);
      })
      .catch(() => {
        if (!cancelled) setSession({ items: [], total: 0, pendingLater: 0, nextDueAt: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (session === null) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
    );
  }

  if (result) {
    return <ReviewSummary result={result} />;
  }

  if (session.items.length === 0) {
    return (
      <EmptyState
        icon={Repeat2}
        title="Hoy no tienes repaso"
        description={
          session.pendingLater > 0 && session.nextDueAt
            ? `Tienes ${session.pendingLater} ${session.pendingLater === 1 ? 'pregunta guardada' : 'preguntas guardadas'}; la proxima vuelve el ${formatDate(session.nextDueAt)}.`
            : 'Cuando falles una pregunta en un examen, vuelve aqui a los dos dias.'
        }
      />
    );
  }

  const items = session.items;
  const question = items[index];
  if (!question) return null;

  const current = answers[question.questionVersionId] ?? null;
  const isLast = index === items.length - 1;

  async function handleNext() {
    if (!isLast) {
      setIndex((value) => value + 1);
      return;
    }

    setSending(true);
    try {
      const payload = items
        .map((item) => ({ questionVersionId: item.questionVersionId, answer: answers[item.questionVersionId] }))
        .filter((item): item is { questionVersionId: string; answer: AnswerInput } => hasAnswer(item.answer ?? null));
      setResult(await answerReview(payload));
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo guardar el repaso. Intenta de nuevo.', description: motivoDelError(error) });
      setSending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between text-sm text-ink-500">
          <span>
            Pregunta {index + 1} de {session.items.length}
          </span>
          <span>Repaso</span>
        </div>
        <div className="mt-2 flex gap-1" aria-hidden="true">
          {session.items.map((item, position) => (
            <span
              key={item.questionVersionId}
              className="h-1 flex-1 rounded-full"
              style={{
                backgroundColor: position <= index ? 'var(--brand-primary)' : 'var(--line)',
              }}
            />
          ))}
        </div>
      </div>

      <div className="card rounded-xl p-5">
        <QuestionPrompt
          qtype={question.qtype}
          stem={question.stem}
          options={question.options}
          value={current}
          disabled={sending}
          onChange={(answer) => setAnswers((previous) => ({ ...previous, [question.questionVersionId]: answer }))}
        />
      </div>

      <Button
        size="lg"
        className="w-full"
        loading={sending}
        disabled={!hasAnswer(current)}
        onClick={() => void handleNext()}
      >
        {isLast ? 'Terminar repaso' : 'Siguiente'}
      </Button>
    </div>
  );
}

/**
 * El cierre. Se dice cuantas se acertaron y NO se regana por las falladas: las falladas vuelven
 * solas en unos dias, que es justo el mecanismo. Convertir el repaso en una nota haria que la
 * gente deje de abrirlo.
 */
function ReviewSummary({ result }: { result: ReviewResult }) {
  const failed = result.answered - result.correct;
  return (
    <div className="space-y-5 text-center">
      <div
        className="mx-auto flex h-24 w-24 items-center justify-center rounded-full"
        style={{ backgroundColor: 'var(--brand-primary-soft)' }}
      >
        <CircleCheck className="h-9 w-9" strokeWidth={1.75} style={{ color: 'var(--brand-primary)' }} />
      </div>
      <div>
        <h2 className="font-display text-[22px] font-semibold text-ink-900">Repaso terminado</h2>
        <p className="mt-2 text-base text-ink-500">
          Acertaste {result.correct} de {result.answered}.
        </p>
        {failed > 0 ? (
          <p className="mt-1 text-sm text-ink-500">
            {failed === 1 ? 'La que fallaste vuelve' : `Las ${failed} que fallaste vuelven`} en un par de dias.
          </p>
        ) : (
          <p className="mt-1 text-sm text-ink-500">Todo correcto. Sumaste puntos.</p>
        )}
      </div>
    </div>
  );
}
