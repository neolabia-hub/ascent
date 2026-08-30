'use client';

import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes } from 'react';
import { cn } from './cn';

export type ButtonVariant = 'primary' | 'ghost' | 'outline' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /**
   * EL BOTON COMO MEDIDOR. 0-100: cuanto falta para que la accion se pueda ejecutar.
   *
   * Mientras no llega a 100 el boton no se puede pulsar y se RELLENA con el avance; al llegar se
   * abre con un latido. Existe porque la alternativa —una barra de progreso, un texto que la
   * explica y un boton gris al lado— son tres elementos diciendo lo mismo, y el unico que la
   * persona mira es el que no puede pulsar. Sin definir, es un boton normal.
   */
  meterPct?: number;
}

/**
 * Boton del sistema Pulso.
 *
 * La profundidad es de OFICIO, no decorativa: un realce interior de 1px arriba (la luz cae desde
 * arriba), una elevacion de dos capas suave, y al pulsar se HUNDE de verdad —baja 1px y la sombra
 * se mete dentro—. Eso es lo que separa un boton de un rectangulo de color, y no cuesta ni un
 * gradiente ni una animacion permanente.
 */

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-primary text-white border border-transparent shadow-btn hover:-translate-y-px hover:shadow-btn-hover hover:[filter:brightness(1.06)] active:translate-y-0 active:shadow-btn-active active:[filter:brightness(0.94)]',
  ghost: 'bg-transparent text-ink-700 border border-transparent hover:bg-paper',
  outline:
    'bg-surface text-ink-700 border border-line-strong shadow-btn-flat hover:-translate-y-px hover:border-line-strong hover:shadow-btn hover:bg-paper active:translate-y-0 active:shadow-none',
  danger:
    'bg-danger text-white border border-transparent shadow-btn hover:-translate-y-px hover:shadow-btn-hover hover:[filter:brightness(1.06)] active:translate-y-0 active:shadow-btn-active active:[filter:brightness(0.94)]',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-[52px] px-6 text-base gap-2',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = 'primary', size = 'md', loading = false, meterPct, disabled, children, ...props },
  ref,
) {
  const metering = typeof meterPct === 'number';
  const filled = metering ? Math.max(0, Math.min(100, meterPct)) : 100;
  const locked = metering && filled < 100;

  // El latido de apertura salta al CRUZAR el 100, no al montarse ya abierto: si latiera siempre,
  // dejaria de significar "ya puedes".
  const wasLocked = useRef(locked);
  const [opening, setOpening] = useState(false);
  useEffect(() => {
    if (wasLocked.current && !locked) {
      setOpening(true);
      const timeout = window.setTimeout(() => setOpening(false), 320);
      wasLocked.current = locked;
      return () => window.clearTimeout(timeout);
    }
    wasLocked.current = locked;
  }, [locked]);

  return (
    <button
      ref={ref}
      disabled={disabled || loading || locked}
      aria-disabled={locked ? true : undefined}
      className={cn(
        'focus-ring relative isolate inline-flex items-center justify-center overflow-hidden whitespace-nowrap rounded-md font-medium transition-[transform,box-shadow,filter,background-color,border-color] duration-150 ease-pulse disabled:cursor-not-allowed',
        opening && 'animate-unlock',
        variantClasses[variant],
        sizeClasses[size],
        // DESPUES de la variante a proposito: `twMerge` deja ganar a la ultima, y estas anulan
        // el relleno y el texto blanco del boton normal.
        //
        // Bloqueado no es "apagado": es un medidor que se esta llenando, y tiene que leerse. Se
        // pinta en tinta de marca sobre fondo suave para conservar el contraste tanto sobre lo
        // relleno como sobre lo vacio; el blanco solo aparece cuando el boton ya es pulsable.
        locked && 'bg-transparent text-primary shadow-btn-flat disabled:opacity-100',
        className,
      )}
      style={locked ? { backgroundColor: 'color-mix(in srgb, var(--brand-primary) 10%, transparent)' } : undefined}
      {...props}
    >
      {/*
        El relleno del medidor. Va DETRAS del texto (-z-10) y crece con el avance, asi que el
        boton entero es la barra: no hay una barra ademas del boton.
      */}
      {locked ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 -z-10 transition-[width] duration-500 ease-pulse"
          style={{ width: `${filled}%`, backgroundColor: 'color-mix(in srgb, var(--brand-primary) 26%, transparent)' }}
        />
      ) : null}

      {loading ? (
        <span
          aria-hidden="true"
          className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent opacity-80"
        />
      ) : null}
      {children}
    </button>
  );
});
