'use client';

import { Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { Input } from './input';
import { cn } from './cn';

/**
 * LA BARRA DE FILTRO DE UNA LISTA: buscar por texto, y a lo sumo un par de pastillas.
 *
 * Existe porque cada pantalla se estaba inventando la suya —el buscador de Obligaciones, el de la
 * matriz, el de la lista de evaluaciones— y tres barras parecidas en el mismo modulo obligan a
 * volver a aprender donde se escribe cada vez que se cambia de pestana.
 *
 * El recuento de la derecha NO es decoracion: cuando se filtra, la pregunta inmediata es "¿esto es
 * todo lo que hay, o es lo que deje fuera?", y una lista corta sin explicacion se lee como que el
 * sistema perdio datos.
 */
export function ListFilter({
  value,
  onChange,
  placeholder,
  /** "12 de 340": lo que queda a la vista sobre el total. */
  shown,
  total,
  children,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  shown?: number;
  total?: number;
  /** Pastillas u otros filtros, a la derecha del buscador. */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-4 flex flex-wrap items-center gap-3', className)}>
      <div className="relative w-full sm:w-72">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
        <Input className="pl-9" placeholder={placeholder} aria-label={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />
      </div>
      {children}
      {shown !== undefined && total !== undefined && shown !== total ? (
        <span className="text-sm text-ink-500">
          {shown} de {total}
        </span>
      ) : null}
    </div>
  );
}

/**
 * PASTILLA DE FILTRO. Distinta de la de `ViewTabs` a proposito: aquella cambia de VISTA —de
 * pantalla, casi— y por eso se rellena con el color de la empresa; esta solo acota lo que ya se
 * esta mirando. Si las dos se pintaran igual, el color dejaria de decir "estas aqui".
 */
export function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'focus-ring h-9 rounded-full border px-3.5 text-sm transition-colors duration-150',
        active
          ? 'border-line-strong bg-paper font-medium text-ink-900'
          : 'border-transparent text-ink-500 hover:bg-paper hover:text-ink-900',
      )}
    >
      {children}
    </button>
  );
}
