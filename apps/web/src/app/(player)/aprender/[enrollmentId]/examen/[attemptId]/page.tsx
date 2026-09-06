'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  saveAnswer,
  submitAttempt,
  viewAttempt,
  type AnswerInput,
  type AttemptView,
} from '@/lib/learner-api';
import { ExamStage, stageHasAnswer, type StageQuestion } from '@/components/assessments/exam-stage';
import { readPresentation } from '@/components/assessments/presentation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { motivoDelError } from '@/lib/api';

/**
 * EXAMEN. Una pregunta por pantalla, sin la respuesta correcta a la vista (el servidor no la
 * manda) y sin manera de saltarse la correccion: aqui solo se recogen respuestas.
 *
 * Cada respuesta se guarda al avanzar, pero la ENTREGA vuelve a mandarlas TODAS. Es a proposito:
 * si el telefono perdio senal a mitad del examen, los guardados intermedios fallaron y solo la
 * entrega final salva el intento. El contrato del backend acepta justo eso.
 *
 * LO QUE SE VE lo pone `ExamStage`, que es la MISMA pieza que usa la vista previa del
 * administrador (Decision #85). Esta pantalla se queda con lo que solo puede hacer ella: pedir el
 * intento, guardar, contar el tiempo contra la hora del servidor y entregar. Antes tenia tambien
 * la maquetacion, y por eso la pantalla de armado no podia ensenar lo que iba a pasar de verdad.
 *
 * `wide` no lo decide un punto de ruptura de CSS sino esta pantalla, midiendo la ventana: el
 * escenario tiene que poder pintarse tambien dentro de un marco de telefono de 390 px sin creerse
 * que esta en un monitor.
 */

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
  const [wide, setWide] = useState(false);
  const submitted = useRef(false);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const apply = () => setWide(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

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
        .map((question) => ({
          attemptQuestionId: question.attemptQuestionId,
          answer: answers[question.attemptQuestionId],
        }))
        .filter((row): row is { attemptQuestionId: string; answer: AnswerInput } => stageHasAnswer(row.answer ?? null));
      await submitAttempt(params.attemptId, payload);
      router.push(`/aprender/${params.enrollmentId}/examen/${params.attemptId}/resultado`);
    } catch (error) {
      submitted.current = false;
      setSending(false);
      showToast({ kind: 'danger', title: 'No se pudo entregar el examen. Intenta de nuevo.', description: motivoDelError(error) });
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
        <div className="mx-auto w-full max-w-md space-y-4 sm:max-w-xl lg:max-w-5xl">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-64 w-full rounded-xl" />
          <Skeleton className="h-[52px] w-full rounded-md" />
        </div>
      </main>
    );
  }

  const questions: StageQuestion[] = view.questions.map((question) => ({
    key: question.attemptQuestionId,
    qtype: question.qtype,
    stem: question.stem,
    options: question.options,
    unit: question.unit,
  }));

  /** Guardado oportunista al moverse: si falla, la entrega final las lleva todas igual. */
  const irA = (destino: number) => {
    const actual = view.questions[index];
    const respuesta = actual ? answers[actual.attemptQuestionId] : undefined;
    if (actual && respuesta && stageHasAnswer(respuesta)) {
      void saveAnswer(params.attemptId, actual.attemptQuestionId, respuesta).catch(() => undefined);
    }
    setIndex(destino);
  };

  return (
    <main className="h-[100dvh]">
      <ExamStage
        presentation={readPresentation(view.attempt.presentation)}
        questions={questions}
        answers={answers}
        onAnswer={(key, answer) => setAnswers((previous) => ({ ...previous, [key]: answer }))}
        index={index}
        onIndex={irA}
        wide={wide}
        remainingSeconds={remaining}
        submitting={sending}
        onSubmit={() => void submit()}
      />
    </main>
  );
}
