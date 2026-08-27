'use client';

import { Check } from 'lucide-react';
import type { AnswerInput, QuestionType } from '@/lib/learner-api';
import { cn } from '@/components/ui/cn';

/**
 * UNA pregunta en pantalla, con sus opciones como tarjetas grandes (skill pulse-ui, seccion 2:
 * "una pregunta por pantalla, opciones como tarjetas seleccionables de 56px").
 *
 * Sirve tanto al examen como a la sesion de repaso: son la misma interaccion y merecen el mismo
 * componente, porque lo que se aprende en uno se sabe usar en el otro.
 *
 * Aqui NO se sabe cual es la respuesta correcta, y es a proposito: el servidor nunca la manda
 * mientras se esta respondiendo.
 */

export interface QuestionPromptProps {
  qtype: QuestionType;
  stem: string;
  options: Array<{ id: string; text: string }>;
  value: AnswerInput | null;
  onChange: (answer: AnswerInput) => void;
  /** Bloquea la interaccion mientras se entrega. */
  disabled?: boolean;
}

const TRUE_FALSE_OPTIONS = [
  { id: 'true', text: 'Verdadero', value: true },
  { id: 'false', text: 'Falso', value: false },
];

export function QuestionPrompt({ qtype, stem, options, value, onChange, disabled = false }: QuestionPromptProps) {
  if (qtype === 'ESSAY') {
    return (
      <div>
        <p className="font-display text-lg font-semibold leading-snug text-ink-900">{stem}</p>
        <p className="mt-2 text-sm text-ink-500">Responde con tus palabras. La revisa una persona.</p>
        <textarea
          className="focus-ring mt-4 min-h-[160px] w-full rounded-md border border-line-strong bg-surface p-3 text-base text-ink-900"
          maxLength={5000}
          value={value?.text ?? ''}
          disabled={disabled}
          onChange={(event) => onChange({ text: event.target.value })}
          placeholder="Escribe tu respuesta"
        />
      </div>
    );
  }

  if (qtype === 'TRUE_FALSE') {
    return (
      <div>
        <p className="font-display text-lg font-semibold leading-snug text-ink-900">{stem}</p>
        <ul className="mt-5 space-y-3">
          {TRUE_FALSE_OPTIONS.map((option) => (
            <li key={option.id}>
              <OptionButton
                text={option.text}
                selected={value?.value === option.value}
                disabled={disabled}
                onClick={() => onChange({ value: option.value })}
              />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const isMulti = qtype === 'MULTI';
  const selectedIds = isMulti ? (value?.optionIds ?? []) : value?.optionId ? [value.optionId] : [];

  function toggle(optionId: string) {
    if (!isMulti) {
      onChange({ optionId });
      return;
    }
    const current = new Set(selectedIds);
    if (current.has(optionId)) {
      current.delete(optionId);
    } else {
      current.add(optionId);
    }
    onChange({ optionIds: [...current] });
  }

  return (
    <div>
      <p className="font-display text-lg font-semibold leading-snug text-ink-900">{stem}</p>
      {isMulti ? <p className="mt-2 text-sm text-ink-500">Puedes marcar varias.</p> : null}
      <ul className="mt-5 space-y-3">
        {options.map((option) => (
          <li key={option.id}>
            <OptionButton
              text={option.text}
              selected={selectedIds.includes(option.id)}
              disabled={disabled}
              onClick={() => toggle(option.id)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function OptionButton({
  text,
  selected,
  disabled,
  onClick,
}: {
  text: string;
  selected: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'focus-ring flex min-h-[56px] w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-base transition-colors duration-150 ease-pulse disabled:opacity-60',
        selected ? 'border-primary bg-primary-soft text-ink-900' : 'border-line-strong bg-surface text-ink-700',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2',
          selected ? 'border-primary bg-primary text-white' : 'border-line-strong',
        )}
      >
        {selected ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
      </span>
      <span className="min-w-0">{text}</span>
    </button>
  );
}

/** Una respuesta cuenta como dada solo si tiene contenido: null no se envia. */
export function hasAnswer(answer: AnswerInput | null): boolean {
  if (!answer) return false;
  if (answer.optionId) return true;
  if (answer.optionIds && answer.optionIds.length > 0) return true;
  if (typeof answer.value === 'boolean') return true;
  if (answer.text && answer.text.trim().length > 0) return true;
  return false;
}
