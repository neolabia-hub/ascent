'use client';

import { Flame } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { cn } from './cn';

export interface StreakPillProps {
  days: number;
  /** Variante clara para fondos oscuros (reproductor). */
  onDark?: boolean;
  className?: string;
}

/**
 * PastillaRacha (skill pulse-ui, seccion 3). La racha es PRIVADA (Decision #23): esta pastilla
 * solo se dibuja para su propio dueno, nunca en una lista de otras personas.
 *
 * Late al INCREMENTAR, no al montarse: si latiera en cada render, dejaria de significar algo.
 */
export function StreakPill({ days, onDark = false, className }: StreakPillProps) {
  const previous = useRef(days);
  const [beating, setBeating] = useState(false);

  useEffect(() => {
    if (days > previous.current) {
      setBeating(true);
      const timeout = window.setTimeout(() => setBeating(false), 320);
      previous.current = days;
      return () => window.clearTimeout(timeout);
    }
    previous.current = days;
  }, [days]);

  const label = days === 1 ? '1 dia seguido' : `${days} dias seguidos`;

  return (
    <span
      aria-label={days === 0 ? 'Sin racha activa' : label}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-sm font-semibold',
        onDark ? 'bg-white/10 text-white' : 'bg-accent-soft text-ink-900',
        beating && 'animate-pulse-ring',
        className,
      )}
    >
      <Flame
        className="h-4 w-4"
        strokeWidth={1.75}
        style={{ color: days === 0 ? 'var(--ink-300)' : 'var(--brand-accent)' }}
        aria-hidden="true"
      />
      <span className="tabular-nums">{days}</span>
    </span>
  );
}
