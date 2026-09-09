import type { TextareaHTMLAttributes } from 'react';
import { cn } from './cn';

/**
 * Campo de texto largo. Mismo tratamiento visual que `Input` (borde, foco, deshabilitado) para
 * que un formulario mixto no se vea cosido de dos sistemas distintos.
 */
export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'focus-ring w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink-900 placeholder:text-ink-300 transition-colors duration-150 disabled:cursor-not-allowed disabled:bg-paper disabled:text-ink-300',
        className,
      )}
      {...props}
    />
  );
}
