import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from './cn';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid = false, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        'focus-ring h-10 w-full rounded-md border bg-surface px-3 text-sm text-ink-900 placeholder:text-ink-300 transition-colors duration-150',
        invalid ? 'border-danger' : 'border-line-strong',
        'disabled:cursor-not-allowed disabled:bg-paper disabled:text-ink-300',
        className,
      )}
      {...props}
    />
  );
});
