import { ChevronDown } from 'lucide-react';
import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from './cn';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, invalid = false, children, ...props },
  ref,
) {
  return (
    <div className="relative">
      {/*
        Mismo acabado que los botones: realce interior arriba, y el borde se refuerza al pasar por
        encima. Un desplegable plano al lado de un boton con profundidad se lee como si estuviera
        deshabilitado, y en estos formularios hay mas desplegables que botones.
      */}
      <select
        ref={ref}
        className={cn(
          'focus-ring peer h-10 w-full appearance-none rounded-md border bg-surface px-3 pr-9 text-sm text-ink-900 shadow-btn-flat transition-all duration-150 ease-pulse',
          'hover:border-line-strong hover:shadow-btn',
          invalid ? 'border-danger' : 'border-line-strong',
          'disabled:cursor-not-allowed disabled:border-line disabled:bg-paper disabled:text-ink-300 disabled:shadow-none',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        strokeWidth={2}
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-500 transition-colors duration-150 peer-hover:text-ink-900 peer-disabled:text-ink-300"
      />
    </div>
  );
});
