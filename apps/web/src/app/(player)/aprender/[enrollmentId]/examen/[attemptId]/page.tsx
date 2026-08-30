'use client';

import { ChevronLeft, Clock } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  saveAnswer,
  submitAttempt,
  viewAttempt,
  type AnswerInput,
  type AttemptView,
} from '@/lib/learner-api';
import { QuestionPrompt, hasAnswer } from '@/components/modules/learner/question-prompt';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';

/**
 * EXAMEN. Una pregunta por pantalla, sin la respuesta correcta a la vista (el servidor no la
 * manda) y sin manera de saltarse la correccion: aqui solo se recogen respuestas.
 *
 * Cada respuesta se guarda al avanzar, pero la ENTREGA vuelve a mandarlas TODAS. Es a proposito:
 * si el telefono perdio senal a mitad del examen, los guardados intermedios fallaron y solo la
 * entrega final salva el intento. El contrato del backend acepta justo eso.
 */

/**
 * Una pregunta por pantalla NO significa una columna de telefono en un monitor de 27 pulgadas.
 * El examen se rinde tanto desde bodega como desde un escritorio, y esta pantalla se habia
 * quedado clavada en 448 px mientras el resto de la superficie del aprendiz si crecia.
 *
 * La columna se ensancha, pero con tope: una linea de texto de 1400 px no se lee, se recorre. El
 * patron es el mismo de todas las pantallas de lectura del producto.
 */
const SHELL = 'mx-auto w-full max-w-md sm:max-w-xl lg:max-w-2xl';

export default function AttemptPage() {
  const params = useParams<{ enrollmentId: string; attemptId: string }>();
  const router = useRouter();
  const { showToast } = useToast();

  const [view, setView] = useState<AttemptView | null>(null);
  const [failed, setFailed] = useState(false);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerInput>>({});
  const [sending, setSending] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const submitted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    viewAttempt(params.attemptId)
      .then((value) => {
        if (cancelled) return;
        setView(value);
        // Se recuperan las respuestas ya guardadas: retomar un intento no obliga a repetirlo.
        const existing: Record<string, AnswerInput> = {};
        for (const question of value.questions) {
          if (question.answer) existing[question.attemptQuestionId] = question.answer;
        }
        setAnswers(existing);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [params.attemptId]);

  const submit = useCallback(async () => {
    if (submitted.current || !view) return;
    submitted.current = true;
    setSending(true);
    try {
      const payload = view.questions
        .map((question) => ({ attemptQuestionId: question.attemptQuestionId, answer: answers[question.attemptQuestionId] }))
        .filter((row): row is { attemptQuestionId: string; answer: AnswerInput } => hasAnswer(row.answer ?? null));
      await submitAttempt(params.attemptId, payload);
      router.push(`/aprender/${params.enrollmentId}/examen/${params.attemptId}/resultado`);
    } catch {
      submitted.current = false;
      setSending(false);
      showToast({ kind: 'danger', title: 'No se pudo entregar el examen. Intenta de nuevo.' });
    }
  }, [answers, params.attemptId, params.enrollmentId, router, showToast, view]);

  // Tiempo limite: la cuenta atras corre contra la hora de INICIO que dio el servidor, no contra
  // el momento en que se abrio la pantalla; recargar la pagina no regala minutos.
  useEffect(() => {
    if (!view?.attempt.timeLimitMin) return;
    const endsAt = new Date(view.attempt.startedAt).getTime() + view.attempt.timeLimitMin * 60 * 1000;
    const timer = window.setInterval(() => {
      setRemaining(Math.max(0, Math.round((endsAt - Date.now()) / 1000)));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [view]);

  useEffect(() => {
    if (remaining === 0 && !submitted.current) {
      showToast({ kind: 'warning', title: 'Se acabo el tiempo. Entregamos lo que llevabas.' });
      void submit();
    }
  }, [remaining, showToast, submit]);

  if (failed) {
    return (
      <main className="learner-surface flex min-h-screen items-center justify-center bg-paper px-6 text-center">
        <div>
          <p className="text-base text-ink-500">No pudimos abrir la evaluacion.</p>
          <Button variant="outline" className="mt-4" onClick={() => router.push(`/aprender/${params.enrollmentId}`)}>
            Volver
          </Button>
        </div>
      </main>
    );
  }

  if (!view) {
    return (
      <main className="learner-surface min-h-screen bg-paper px-5 py-6">
        <div className={`${SHELL} space-y-4`}>
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-[52px] w-full rounded-md" />
        </div>
      </main>
    );
  }

  const question = view.questions[index];
  if (!question) return null;

  const current = answers[question.attemptQuestionId] ?? null;
  const isLast = index === view.questions.length - 1;
  const answeredCount = view.questions.filter((row) => hasAnswer(answers[row.attemptQuestionId] ?? null)).length;

  const next = async () => {
    // Guardado oportunista: si falla, la entrega final la lleva igual.
    if (current && hasAnswer(current)) {
      void saveAnswer(params.attemptId, question.attemptQuestionId, current).catch(() => undefined);
    }
    if (!isLast) {
      setIndex((value) => value + 1);
      return;
    }
    await submit();
  };

  return (
    <main className="learner-surface flex min-h-screen flex-col bg-paper">
      <header className="shrink-0 border-b border-line bg-surface">
        <div className={`${SHELL} flex h-14 items-center gap-3 px-5 lg:px-0`}>
          <button
            type="button"
            aria-label="Pregunta anterior"
            disabled={index === 0 || sending}
            onClick={() => setIndex((value) => Math.max(0, value - 1))}
            className="focus-ring -ml-2 flex h-10 w-10 items-center justify-center rounded-full text-ink-700 disabled:opacity-30"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          </button>
          <p className="flex-1 text-sm text-ink-500">
            Pregunta {index + 1} de {view.questions.length}
          </p>
          {remaining !== null ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium tabular-nums text-ink-700">
              <Clock className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              {formatClock(remaining)}
            </span>
          ) : null}
        </div>
        <div className={`${SHELL} flex gap-1 px-5 pb-3 lg:px-0`} aria-hidden="true">
          {view.questions.map((row, position) => (
            <span
              key={row.attemptQuestionId}
              className="h-1 flex-1 rounded-full"
              style={{
                backgroundColor: hasAnswer(answers[row.attemptQuestionId] ?? null)
                  ? 'var(--brand-primary)'
                  : position === index
                    ? 'var(--line-strong)'
                    : 'var(--line)',
              }}
            />
          ))}
        </div>
      </header>

      <section className="flex-1 overflow-y-auto px-5 py-6 lg:py-10">
        <div className={SHELL}>
          <QuestionPrompt
            qtype={question.qtype}
            stem={question.stem}
            options={question.options}
            value={current}
            disabled={sending}
            onChange={(answer) => setAnswers((previous) => ({ ...previous, [question.attemptQuestionId]: answer }))}
          />
        </div>
      </section>

      <footer className="shrink-0 border-t border-line bg-surface px-5 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-3">
        {/*
          En telefono el boton ocupa el ancho (es el unico gesto de la pantalla); en escritorio se
          va a la derecha y el aviso se pone a su lado, que es donde se mira antes de entregar.
        */}
        <div className={`${SHELL} sm:flex sm:flex-row-reverse sm:items-center sm:justify-between sm:gap-4`}>
          <Button size="lg" className="w-full sm:w-auto sm:min-w-[220px]" loading={sending} onClick={() => void next()}>
            {isLast ? 'Entregar examen' : 'Siguiente'}
          </Button>
          {isLast && answeredCount < view.questions.length ? (
            <p className="mt-2 text-center text-sm text-warn sm:mt-0 sm:text-left">
              Te faltan {view.questions.length - answeredCount} sin responder.
            </p>
          ) : null}
        </div>
      </footer>
    </main>
  );
}

function formatClock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}
