'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, Check, ChevronLeft, Clock } from 'lucide-react';
import type { AnswerInput, QuestionType } from '@/lib/learner-api';
import { cn } from '@/components/ui/cn';
import { accentVars, type Presentation } from './presentation';

/**
 * EL ESCENARIO DEL EXAMEN: lo que ve quien lo rinde.
 *
 * Esta pieza la usan DOS pantallas, y es a proposito:
 *
 *   - el reproductor real (`/aprender/.../examen/...`), y
 *   - la vista previa del administrador mientras lo arma.
 *
 * Si fueran dos implementaciones, la vista previa mentiria en cuanto una de las dos cambiara, y
 * una vista previa que miente es peor que no tenerla: se publica confiando en ella. Aqui solo se
 * recogen respuestas —la correcta no entra en este componente ni por asomo— y quien lo monta
 * decide si hay entrega o no.
 *
 * SOBRE EL ANCHO: no se usan puntos de ruptura sino la prop `wide`, porque el marco de telefono
 * de la vista previa mide 390 px DENTRO de un monitor de 1600. Con `lg:` el telefono simulado
 * saldria con el panel de escritorio al lado, que es justo la mentira que esto viene a evitar.
 */

export interface StageQuestion {
  key: string;
  qtype: QuestionType;
  stem: string;
  /**
   * Que son estas "opciones" depende del tipo: las respuestas en SINGLE/MULTI, los PASOS en
   * ORDER, las DOS COLUMNAS con prefijo L/R en MATCH y los HUECOS en FILL_BLANK. La invariante
   * la sostiene el servidor (ver question-payload.ts) y es lo que permite que el barajado por
   * intento y este componente sirvan para los ocho tipos sin un solo caso especial.
   */
  options: Array<{ id: string; text: string }>;
  /** Solo en NUMERIC: se enseña junto al campo. El numero correcto nunca sale del servidor. */
  unit?: string;
}

export interface ExamStageProps {
  presentation: Presentation;
  questions: StageQuestion[];
  answers: Record<string, AnswerInput>;
  onAnswer: (key: string, answer: AnswerInput) => void;
  index: number;
  onIndex: (index: number) => void;
  /** `true` = hay sitio para el panel lateral. Lo decide quien monta, no el viewport. */
  wide: boolean;
  remainingSeconds?: number | null;
  submitting?: boolean;
  onSubmit?: () => void;
  /** En la vista previa no se entrega nada ni se sale a ningun sitio. */
  readOnly?: boolean;
  onExit?: () => void;
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
const TRUE_FALSE: Array<{ id: string; text: string }> = [
  { id: 'true', text: 'Verdadero' },
  { id: 'false', text: 'Falso' },
];

/** Una respuesta cuenta solo si tiene contenido. */
export function stageHasAnswer(answer: AnswerInput | null | undefined): boolean {
  if (!answer) return false;
  if (answer.optionId) return true;
  if (answer.optionIds && answer.optionIds.length > 0) return true;
  if (typeof answer.value === 'boolean') return true;
  if (answer.text && answer.text.trim().length > 0) return true;
  // Los tipos de la Decision #86. Un hueco a medias YA cuenta como respondida: el panel dice
  // "sin responder" para avisar de lo que quedo en blanco, no para juzgar si esta completa.
  if (answer.blanks && Object.values(answer.blanks).some((value) => value.trim().length > 0)) return true;
  if (answer.order && answer.order.length > 0) return true;
  if (answer.pairs && Object.values(answer.pairs).some(Boolean)) return true;
  if (typeof answer.number === 'number' && Number.isFinite(answer.number)) return true;
  return false;
}

export function ExamStage({
  presentation,
  questions,
  answers,
  onAnswer,
  index,
  onIndex,
  wide,
  remainingSeconds = null,
  submitting = false,
  onSubmit,
  readOnly = false,
  onExit,
}: ExamStageProps) {
  /** Hacia donde se movio: es lo que elige la animacion de entrada. */
  const [direction, setDirection] = useState<1 | -1>(1);
  const previous = useRef(index);
  useEffect(() => {
    if (index !== previous.current) {
      setDirection(index > previous.current ? 1 : -1);
      previous.current = index;
    }
  }, [index]);

  const answered = useMemo(
    () => questions.filter((question) => stageHasAnswer(answers[question.key])).length,
    [questions, answers],
  );
  const total = questions.length;
  const enLista = presentation.pace === 'all';
  const question = questions[index];
  const isLast = index === total - 1;
  const current = question ? (answers[question.key] ?? null) : null;

  const irA = (destino: number) => {
    if (destino < 0 || destino >= total) return;
    onIndex(destino);
  };

  function marcar(optionId: string) {
    if (!question || submitting) return;
    if (question.qtype === 'TRUE_FALSE') {
      onAnswer(question.key, { value: optionId === 'true' });
      if (presentation.autoAdvance && !isLast) window.setTimeout(() => irA(index + 1), 260);
      return;
    }
    if (question.qtype === 'MULTI') {
      const actuales = new Set(current?.optionIds ?? []);
      if (actuales.has(optionId)) actuales.delete(optionId);
      else actuales.add(optionId);
      onAnswer(question.key, { optionIds: [...actuales] });
      return;
    }
    onAnswer(question.key, { optionId });
    // Solo en las de una sola respuesta: en las de varias, avanzar solo seria robar la segunda.
    if (presentation.autoAdvance && !isLast) window.setTimeout(() => irA(index + 1), 260);
  }

  /*
    EL TECLADO. En un examen de veinte preguntas, la diferencia entre teclear y apuntar con el
    raton son varios minutos, y quien rinde ya esta bastante ocupado pensando. A/B/C marca, Enter
    avanza, las flechas van y vienen. No se activa mientras el foco esta escribiendo una respuesta
    abierta: ahi la "b" es una letra, no un atajo.
  */
  useEffect(() => {
    if (enLista || !question) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        irA(index + 1);
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        irA(index - 1);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        if (isLast) {
          if (!readOnly) onSubmit?.();
        } else {
          irA(index + 1);
        }
        return;
      }

      // El atajo de letra SOLO donde hay opciones que marcar. En una de huecos, la "a" es una
      // letra que alguien esta escribiendo, y en una de ordenar no hay nada que "marcar".
      if (question.qtype !== 'SINGLE' && question.qtype !== 'MULTI' && question.qtype !== 'TRUE_FALSE') return;
      const opciones = question.qtype === 'TRUE_FALSE' ? TRUE_FALSE : question.options;
      const posicion = /^[a-hA-H]$/.test(event.key)
        ? event.key.toUpperCase().charCodeAt(0) - 65
        : /^[1-8]$/.test(event.key)
          ? Number(event.key) - 1
          : -1;
      const elegida = posicion >= 0 ? opciones[posicion] : undefined;
      if (!elegida) return;
      event.preventDefault();
      marcar(elegida.id);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const animacion =
    presentation.transition === 'none'
      ? ''
      : presentation.transition === 'fade'
        ? 'ex-fade'
        : direction === 1
          ? 'ex-next'
          : 'ex-prev';

  const fondo =
    presentation.background === 'gradient'
      ? 'bg-[radial-gradient(120%_90%_at_50%_-10%,var(--ex-soft)_0%,transparent_62%)]'
      : '';

  if (total === 0) {
    return (
      <div className="learner-surface flex h-full min-h-[320px] items-center justify-center bg-paper px-6 text-center text-sm text-ink-500">
        Todavia no hay preguntas que mostrar.
      </div>
    );
  }

  return (
    <div style={accentVars(presentation.accent)} className={cn('learner-surface flex h-full flex-col bg-paper', fondo)}>
      {/*
        LA BARRA DE PROGRESO tiene transicion propia y NO se remonta con cada pregunta: lo que
        informa no es verla, es verla CRECER. Si entrara de nuevo en cada paso, saltaria.
      */}
      <div className="h-1 w-full shrink-0 bg-[var(--line)]">
        <div
          className="h-full rounded-r-full transition-[width] duration-500 ease-[cubic-bezier(.22,1,.36,1)]"
          style={{ width: `${((index + 1) / total) * 100}%`, backgroundColor: 'var(--ex-solid)' }}
        />
      </div>

      <header className="shrink-0 border-b border-line bg-surface">
        <div className={cn('mx-auto flex h-14 w-full items-center gap-3 px-4', wide ? 'max-w-5xl' : 'max-w-xl')}>
          {!enLista ? (
            <button
              type="button"
              aria-label="Pregunta anterior"
              disabled={index === 0 || submitting}
              onClick={() => irA(index - 1)}
              className="focus-ring -ml-2 flex h-10 w-10 items-center justify-center rounded-full text-ink-700 transition-colors hover:bg-[var(--ex-soft)] disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            </button>
          ) : onExit ? (
            <button
              type="button"
              aria-label="Salir"
              onClick={onExit}
              className="focus-ring -ml-2 flex h-10 w-10 items-center justify-center rounded-full text-ink-700"
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            </button>
          ) : null}
          <p className="flex-1 text-sm tabular-nums text-ink-500">
            {enLista ? `${answered} de ${total} respondidas` : `Pregunta ${index + 1} de ${total}`}
          </p>
          {remainingSeconds !== null ? (
            <span
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-medium tabular-nums transition-colors',
                remainingSeconds <= 60 ? 'bg-danger-soft text-danger' : 'text-ink-700',
              )}
            >
              <Clock className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              {reloj(remainingSeconds)}
            </span>
          ) : null}
        </div>
      </header>

      <section className="flex-1 overflow-y-auto px-4 py-7">
        {enLista ? (
          /* TODAS EN UNA LISTA: el formulario de siempre, para quien prefiere ver el examen entero. */
          <div className={cn('mx-auto w-full space-y-4', wide ? 'max-w-3xl' : 'max-w-xl')}>
            {questions.map((row, posicion) => (
              <article key={row.key} className="rounded-2xl border border-line bg-surface p-5">
                <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-ink-500">
                  Pregunta {posicion + 1}
                </p>
                <Pregunta
                  question={row}
                  answer={answers[row.key] ?? null}
                  presentation={presentation}
                  disabled={submitting}
                  animate={false}
                  onPick={(optionId) => {
                    if (row.qtype === 'TRUE_FALSE') {
                      onAnswer(row.key, { value: optionId === 'true' });
                      return;
                    }
                    if (row.qtype === 'MULTI') {
                      const actuales = new Set(answers[row.key]?.optionIds ?? []);
                      if (actuales.has(optionId)) actuales.delete(optionId);
                      else actuales.add(optionId);
                      onAnswer(row.key, { optionIds: [...actuales] });
                      return;
                    }
                    onAnswer(row.key, { optionId });
                  }}
                  onAnswer={(respuesta) => onAnswer(row.key, respuesta)}
                />
              </article>
            ))}
          </div>
        ) : (
          <div
            className={cn(
              'mx-auto w-full',
              wide ? 'max-w-5xl lg:grid lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start lg:gap-10' : 'max-w-xl',
            )}
          >
            {/*
              LA CLAVE ES `key={index}`: obliga a React a montar de nuevo el bloque en cada
              pregunta, que es lo unico que hace que la animacion de entrada vuelva a dispararse.
              Sin ella el texto cambia y no se mueve nada.
            */}
            <div key={index} className={cn('w-full', animacion)}>
              {question ? (
                <Pregunta
                  question={question}
                  answer={current}
                  presentation={presentation}
                  disabled={submitting}
                  animate={presentation.transition !== 'none'}
                  onPick={marcar}
                  onAnswer={(respuesta) => onAnswer(question.key, respuesta)}
                />
              ) : null}
            </div>

            {wide ? (
              <aside className="mt-10 lg:mt-0">
                <div className="rounded-2xl border border-line bg-surface p-4">
                  <p className="text-sm font-medium text-ink-900">
                    {answered} de {total} respondidas
                  </p>
                  <p className="mt-0.5 text-xs text-ink-500">
                    {answered === total ? 'Puedes entregar cuando quieras.' : `Te faltan ${total - answered}.`}
                  </p>
                  <div className="mt-4 grid grid-cols-5 gap-1.5">
                    {questions.map((row, posicion) => {
                      const respondida = stageHasAnswer(answers[row.key]);
                      const actual = posicion === index;
                      return (
                        <button
                          key={row.key}
                          type="button"
                          onClick={() => irA(posicion)}
                          disabled={submitting}
                          aria-current={actual ? 'true' : undefined}
                          aria-label={`Ir a la pregunta ${posicion + 1}${respondida ? ', respondida' : ', sin responder'}`}
                          className={cn(
                            'focus-ring flex h-9 items-center justify-center rounded-lg border text-sm font-medium tabular-nums transition-all duration-150',
                            actual
                              ? 'text-[var(--ex-on)]'
                              : respondida
                                ? 'border-transparent text-ink-900'
                                : 'border-line text-ink-500 hover:border-line-strong',
                          )}
                          style={
                            actual
                              ? { backgroundColor: 'var(--ex-solid)', borderColor: 'var(--ex-solid)' }
                              : respondida
                                ? { backgroundColor: 'var(--ex-soft)' }
                                : undefined
                          }
                        >
                          {posicion + 1}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-xs text-ink-500">
                    Las claras estan sin responder. Puedes volver a cualquiera antes de entregar.
                  </p>
                </div>
              </aside>
            ) : null}
          </div>
        )}
      </section>

      <footer className="shrink-0 border-t border-line bg-surface px-4 pb-[calc(env(safe-area-inset-bottom)+14px)] pt-3">
        <div
          className={cn(
            'mx-auto flex w-full items-center gap-3',
            wide ? 'max-w-5xl' : 'max-w-xl',
            enLista ? 'justify-end' : 'flex-row-reverse justify-between',
          )}
        >
          <button
            type="button"
            disabled={submitting}
            onClick={() => {
              if (enLista || isLast) {
                if (!readOnly) onSubmit?.();
                return;
              }
              irA(index + 1);
            }}
            className="focus-ring inline-flex h-12 min-w-[180px] items-center justify-center gap-2 rounded-xl px-6 text-base font-medium transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-60"
            style={{ backgroundColor: 'var(--ex-solid)', color: 'var(--ex-on)' }}
          >
            {enLista || isLast ? 'Entregar examen' : 'Siguiente'}
          </button>
          {!enLista && !wide ? (
            <div className="flex gap-1" aria-hidden="true">
              {questions.map((row, posicion) => (
                <span
                  key={row.key}
                  className="h-1.5 w-1.5 rounded-full transition-colors"
                  style={{
                    backgroundColor: stageHasAnswer(answers[row.key])
                      ? 'var(--ex-solid)'
                      : posicion === index
                        ? 'var(--line-strong)'
                        : 'var(--line)',
                  }}
                />
              ))}
            </div>
          ) : null}
          {(enLista || isLast) && answered < total ? (
            <p className="text-sm text-warn">Te faltan {total - answered} sin responder.</p>
          ) : null}
        </div>
      </footer>
    </div>
  );
}

/** El enunciado y sus opciones. No sabe cual es la correcta, y nunca debe saberlo. */
function Pregunta({
  question,
  answer,
  presentation,
  disabled,
  animate,
  onPick,
  onAnswer,
}: {
  question: StageQuestion;
  answer: AnswerInput | null;
  presentation: Presentation;
  disabled: boolean;
  animate: boolean;
  /** Marcar una opcion. Solo lo usan los tipos que tienen opciones que marcar. */
  onPick: (optionId: string) => void;
  /** La respuesta entera. Los tipos de la Decision #86 la arman ellos. */
  onAnswer: (answer: AnswerInput) => void;
}) {
  if (question.qtype === 'ESSAY') {
    return (
      <div>
        <h2 className="font-display text-xl font-semibold leading-snug text-ink-900 lg:text-[26px]">{question.stem}</h2>
        <p className="mt-2 text-sm text-ink-500">Responde con tus palabras. La revisa una persona.</p>
        <textarea
          className="focus-ring mt-5 min-h-[180px] w-full rounded-xl border border-line-strong bg-surface p-4 text-base text-ink-900"
          maxLength={5000}
          value={answer?.text ?? ''}
          disabled={disabled}
          onChange={(event) => onAnswer({ text: event.target.value })}
          placeholder="Escribe tu respuesta"
        />
      </div>
    );
  }

  if (question.qtype === 'FILL_BLANK') {
    return <Huecos question={question} answer={answer} disabled={disabled} animate={animate} onAnswer={onAnswer} />;
  }
  if (question.qtype === 'ORDER') {
    return <Ordenar question={question} answer={answer} disabled={disabled} animate={animate} onAnswer={onAnswer} />;
  }
  if (question.qtype === 'MATCH') {
    return <Emparejar question={question} answer={answer} disabled={disabled} animate={animate} onAnswer={onAnswer} />;
  }
  if (question.qtype === 'NUMERIC') {
    return <Numerica question={question} answer={answer} disabled={disabled} onAnswer={onAnswer} />;
  }

  const opciones = question.qtype === 'TRUE_FALSE' ? TRUE_FALSE : question.options;
  const multiple = question.qtype === 'MULTI';
  const elegidas = multiple
    ? new Set(answer?.optionIds ?? [])
    : question.qtype === 'TRUE_FALSE'
      ? new Set(typeof answer?.value === 'boolean' ? [answer.value ? 'true' : 'false'] : [])
      : new Set(answer?.optionId ? [answer.optionId] : []);

  return (
    <div>
      <h2 className="font-display text-xl font-semibold leading-snug text-ink-900 lg:text-[26px]">{question.stem}</h2>
      {multiple ? <p className="mt-2 text-sm text-ink-500">Puedes marcar varias.</p> : null}
      <ul className="mt-6 space-y-3">
        {opciones.map((option, posicion) => {
          const seleccionada = elegidas.has(option.id);
          return (
            <li
              key={option.id}
              className={animate ? 'ex-option' : undefined}
              /* El escalonado: cada opcion entra 45 ms despues de la anterior. */
              style={animate ? { animationDelay: `${90 + posicion * 45}ms` } : undefined}
            >
              <button
                type="button"
                aria-pressed={seleccionada}
                disabled={disabled}
                onClick={() => onPick(option.id)}
                className={cn(
                  'focus-ring flex min-h-[60px] w-full items-center gap-3.5 rounded-xl border-2 px-4 py-3 text-left text-base transition-all duration-150 disabled:opacity-60',
                  seleccionada
                    ? 'ex-picked text-ink-900'
                    : 'border-line-strong bg-surface text-ink-700 hover:-translate-y-0.5 hover:border-[var(--ex-ring)]',
                )}
                style={
                  seleccionada ? { borderColor: 'var(--ex-solid)', backgroundColor: 'var(--ex-soft)' } : undefined
                }
              >
                {/*
                  LA LETRA no es decoracion: es lo que hace descubrible el atajo de teclado. Sin
                  ella, "pulsa B" no tiene a que referirse.
                */}
                {presentation.optionLetters ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold transition-colors',
                      seleccionada ? 'border-transparent' : 'border-line-strong text-ink-500',
                    )}
                    style={seleccionada ? { backgroundColor: 'var(--ex-solid)', color: 'var(--ex-on)' } : undefined}
                  >
                    {seleccionada ? <Check className="h-4 w-4" strokeWidth={3} /> : (LETTERS[posicion] ?? posicion + 1)}
                  </span>
                ) : (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2',
                      seleccionada ? 'border-transparent' : 'border-line-strong',
                    )}
                    style={seleccionada ? { backgroundColor: 'var(--ex-solid)', color: 'var(--ex-on)' } : undefined}
                  >
                    {seleccionada ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
                  </span>
                )}
                <span className="min-w-0 flex-1">{option.text}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {presentation.optionLetters ? (
        <p className="mt-5 hidden text-xs text-ink-300 lg:block">
          Puedes usar el teclado: {LETTERS.slice(0, Math.min(opciones.length, 4)).join(', ')} para marcar, Enter para
          seguir.
        </p>
      ) : null}
    </div>
  );
}

// ─────────────────────────── Los tipos de la Decision #86 ───────────────────────────

interface TipoNuevoProps {
  question: StageQuestion;
  answer: AnswerInput | null;
  disabled: boolean;
  animate: boolean;
  onAnswer: (answer: AnswerInput) => void;
}

/**
 * COMPLETAR HUECOS.
 *
 * El enunciado NO se enseña como texto con los campos debajo: los huecos se abren DENTRO de la
 * frase, en su sitio. Es la diferencia entre leer "El arnes se inspecciona cada ___" y leer una
 * frase con un agujero seguida de "Hueco 1: [ ]", que obliga a hacer la correspondencia mental.
 *
 * El campo CRECE con lo escrito: una anchura fija seria una pista de cuantas letras tiene la
 * respuesta, que es justo la ayuda que este tipo de pregunta viene a quitar.
 */
function Huecos({ question, answer, disabled, animate, onAnswer }: TipoNuevoProps) {
  const escrito = answer?.blanks ?? {};
  const trozos = question.stem.split(/(\{\{\w+\}\})/g);
  const escribir = (id: string, value: string) => onAnswer({ blanks: { ...escrito, [id]: value } });

  return (
    <div className={animate ? 'ex-option' : undefined}>
      <p className="font-display text-xl font-semibold leading-[2.1] text-ink-900 lg:text-[26px]">
        {trozos.map((trozo, i) => {
          const marca = /^\{\{(\w+)\}\}$/.exec(trozo);
          if (!marca) return <span key={i}>{trozo}</span>;
          const id = marca[1] as string;
          const valor = escrito[id] ?? '';
          return (
            <input
              key={i}
              value={valor}
              disabled={disabled}
              maxLength={200}
              size={Math.max(6, valor.length + 2)}
              aria-label={`Hueco ${id}`}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={(event) => escribir(id, event.target.value)}
              className="focus-ring mx-1 inline-block min-w-[5rem] max-w-full rounded-lg border-b-[3px] border-[var(--ex-ring)] bg-[var(--ex-soft)] px-2.5 py-0.5 text-center align-baseline font-display text-xl font-semibold text-ink-900 lg:text-[26px]"
            />
          );
        })}
      </p>
      <p className="mt-5 text-sm text-ink-500">
        Escribe la palabra que falta. No se tienen en cuenta las tildes ni las mayusculas.
      </p>
    </div>
  );
}

/**
 * ORDENAR LOS PASOS.
 *
 * SIN ARRASTRAR, y no es una version pobre del arrastre: es la que funciona. En el telefono de
 * una obra, arrastrar dentro de una pagina que se desplaza pelea con el gesto de hacer scroll; y
 * con guantes, con lector de pantalla o solo con teclado, no hay arrastre que valga. Dos botones
 * de 40 px hacen lo mismo en todos esos casos.
 *
 * El numero de la izquierda es la POSICION ACTUAL y cambia al mover: es lo que convierte
 * "ordenar" en algo que se ve terminado.
 */
function Ordenar({ question, answer, disabled, animate, onAnswer }: TipoNuevoProps) {
  // Sin respuesta previa se parte del orden que sirvio el servidor (que ya viene barajado).
  const actual = answer?.order?.length === question.options.length ? answer.order : question.options.map((o) => o.id);
  const porId = new Map(question.options.map((option) => [option.id, option.text]));

  const mover = (indice: number, salto: -1 | 1) => {
    const destino = indice + salto;
    if (disabled || destino < 0 || destino >= actual.length) return;
    const copia = [...actual];
    [copia[indice], copia[destino]] = [copia[destino] as string, copia[indice] as string];
    onAnswer({ order: copia });
  };

  return (
    <div>
      <h2 className="font-display text-xl font-semibold leading-snug text-ink-900 lg:text-[26px]">{question.stem}</h2>
      <p className="mt-2 text-sm text-ink-500">Ponlos en el orden correcto, del primero al ultimo.</p>
      <ol className="mt-6 space-y-3">
        {actual.map((id, posicion) => (
          <li
            key={id}
            className={animate ? 'ex-option' : undefined}
            style={animate ? { animationDelay: `${90 + posicion * 45}ms` } : undefined}
          >
            <div className="flex min-h-[60px] items-center gap-3 rounded-xl border-2 border-line-strong bg-surface px-3 py-2">
              <span
                aria-hidden="true"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-semibold tabular-nums"
                style={{ backgroundColor: 'var(--ex-soft)', color: 'var(--ex-solid)' }}
              >
                {posicion + 1}
              </span>
              <span className="min-w-0 flex-1 text-base text-ink-900">{porId.get(id) ?? ''}</span>
              <span className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => mover(posicion, -1)}
                  disabled={disabled || posicion === 0}
                  aria-label={`Subir el paso ${posicion + 1}`}
                  className="focus-ring flex h-10 w-10 items-center justify-center rounded-lg border border-line-strong text-ink-700 transition-colors hover:bg-[var(--ex-soft)] disabled:opacity-25 disabled:hover:bg-transparent"
                >
                  <ArrowUp size={17} />
                </button>
                <button
                  type="button"
                  onClick={() => mover(posicion, 1)}
                  disabled={disabled || posicion === actual.length - 1}
                  aria-label={`Bajar el paso ${posicion + 1}`}
                  className="focus-ring flex h-10 w-10 items-center justify-center rounded-lg border border-line-strong text-ink-700 transition-colors hover:bg-[var(--ex-soft)] disabled:opacity-25 disabled:hover:bg-transparent"
                >
                  <ArrowDown size={17} />
                </button>
              </span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * EMPAREJAR.
 *
 * Tampoco se arrastra, por lo mismo. Cada fila lleva su desplegable con las opciones del otro
 * lado, y la opcion repetida se AVISA en vez de impedirse: bloquearla obligaria a deshacer una
 * eleccion anterior antes de poder probar otra, que es justo el razonamiento por descarte que
 * esta pregunta viene a provocar.
 */
function Emparejar({ question, answer, disabled, animate, onAnswer }: TipoNuevoProps) {
  // Las dos columnas llegan en la misma lista, con prefijo (ver `question-payload.ts`).
  const izquierda = question.options.filter((option) => option.id.startsWith('L'));
  const derecha = question.options.filter((option) => option.id.startsWith('R'));
  const unido = answer?.pairs ?? {};
  const repetidas = new Set(Object.values(unido).filter((valor, i, todos) => valor && todos.indexOf(valor) !== i));

  return (
    <div>
      <h2 className="font-display text-xl font-semibold leading-snug text-ink-900 lg:text-[26px]">{question.stem}</h2>
      <p className="mt-2 text-sm text-ink-500">Une cada uno con lo que le corresponde.</p>
      <ul className="mt-6 space-y-3">
        {izquierda.map((option, posicion) => {
          const elegido = unido[option.id] ?? '';
          return (
            <li
              key={option.id}
              className={animate ? 'ex-option' : undefined}
              style={animate ? { animationDelay: `${90 + posicion * 45}ms` } : undefined}
            >
              <div className="grid gap-2 rounded-xl border-2 border-line-strong bg-surface p-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                <span className="text-base text-ink-900">{option.text}</span>
                <ArrowRight size={16} className="hidden justify-self-center text-ink-300 sm:block" aria-hidden="true" />
                <select
                  value={elegido}
                  disabled={disabled}
                  aria-label={`Que corresponde a ${option.text}`}
                  onChange={(event) => onAnswer({ pairs: { ...unido, [option.id]: event.target.value } })}
                  className={cn(
                    'focus-ring min-h-[48px] w-full rounded-lg border-2 bg-paper px-3 text-base text-ink-900',
                    repetidas.has(elegido) ? 'border-warn' : 'border-line-strong',
                  )}
                  style={elegido && !repetidas.has(elegido) ? { borderColor: 'var(--ex-solid)' } : undefined}
                >
                  <option value="">Elegir...</option>
                  {derecha.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.text}
                    </option>
                  ))}
                </select>
              </div>
            </li>
          );
        })}
      </ul>
      {repetidas.size > 0 ? (
        <p className="mt-4 rounded-lg bg-warn-soft px-4 py-2.5 text-sm text-warn">
          Has usado la misma respuesta en dos filas. Puedes dejarlo asi, pero solo una puede estar bien.
        </p>
      ) : null}
    </div>
  );
}

/**
 * RESPUESTA NUMERICA. Campo grande, teclado numerico en el telefono y la unidad pegada al numero:
 * sin ella, "1,5" y "150" parecen respuestas distintas a la misma pregunta.
 */
function Numerica({ question, answer, disabled, onAnswer }: Omit<TipoNuevoProps, 'animate'>) {
  const valor = typeof answer?.number === 'number' && Number.isFinite(answer.number) ? String(answer.number) : '';

  return (
    <div>
      <h2 className="font-display text-xl font-semibold leading-snug text-ink-900 lg:text-[26px]">{question.stem}</h2>
      <div className="mt-7 flex items-center gap-3">
        <input
          type="number"
          step="any"
          inputMode="decimal"
          disabled={disabled}
          value={valor}
          aria-label="Tu respuesta"
          placeholder="0"
          onChange={(event) => {
            const numero = Number(event.target.value);
            // Un campo vacio NO es un cero: se manda una respuesta sin numero y cuenta como en
            // blanco, que es lo que el panel lateral necesita poder decir.
            onAnswer(event.target.value === '' || !Number.isFinite(numero) ? {} : { number: numero });
          }}
          className="focus-ring min-h-[72px] w-full max-w-[16rem] rounded-xl border-2 border-line-strong bg-surface px-4 font-display text-3xl font-semibold text-ink-900 placeholder:text-ink-300"
          style={valor ? { borderColor: 'var(--ex-solid)', backgroundColor: 'var(--ex-soft)' } : undefined}
        />
        {question.unit ? <span className="font-display text-2xl font-medium text-ink-500">{question.unit}</span> : null}
      </div>
    </div>
  );
}

function reloj(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}
