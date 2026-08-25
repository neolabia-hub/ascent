'use client';

import { useEffect, useState } from 'react';
import { cn } from './cn';

export interface ProgressRingProps {
  /** Porcentaje de avance, 0-100. */
  value: number;
  /** Diametro en px. Usa 20 para la variante mini de filas de tabla. */
  size?: number;
  /** true cuando el valor acaba de llegar a 100: dispara el latido de la marca. */
  pulse?: boolean;
  showLabel?: boolean;
  className?: string;
}

export function ProgressRing({
  value,
  size = 64,
  pulse = false,
  showLabel = true,
  className,
}: ProgressRingProps) {
  const [animating, setAnimating] = useState(false);
  const clamped = Math.max(0, Math.min(100, value));
  const strokeWidth = size <= 24 ? 3 : 8;
  const radius = size / 2 - strokeWidth / 2 - 1;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const mini = size <= 24;

  useEffect(() => {
    if (!pulse) {
      return;
    }
    setAnimating(true);
    const timeout = window.setTimeout(() => setAnimating(false), 320);
    return () => window.clearTimeout(timeout);
  }, [pulse]);

  return (
    <div
      className={cn('relative inline-flex items-center justify-center', animating && 'animate-pulse-ring', className)}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--line)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--brand-primary)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 220ms cubic-bezier(.2,.8,.2,1)' }}
        />
      </svg>
      {showLabel && !mini ? (
        <span className="absolute font-display text-sm font-semibold text-ink-900">
          {Math.round(clamped)}%
        </span>
      ) : null}
    </div>
  );
}
