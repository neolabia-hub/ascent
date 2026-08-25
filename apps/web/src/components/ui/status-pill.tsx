import { cn } from './cn';

export type StatusPillKind = 'ok' | 'warn' | 'danger' | 'info' | 'neutral';

export interface StatusPillProps {
  kind: StatusPillKind;
  label: string;
  className?: string;
}

const dotClasses: Record<StatusPillKind, string> = {
  ok: 'bg-ok',
  warn: 'bg-warn',
  danger: 'bg-danger',
  info: 'bg-info',
  neutral: 'bg-ink-300',
};

const textClasses: Record<StatusPillKind, string> = {
  ok: 'text-ok',
  warn: 'text-warn',
  danger: 'text-danger',
  info: 'text-info',
  neutral: 'text-ink-500',
};

export function StatusPill({ kind, label, className }: StatusPillProps) {
  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', dotClasses[kind])} />
      <span className={cn('text-[11px] font-semibold uppercase tracking-[0.04em]', textClasses[kind])}>
        {label}
      </span>
    </span>
  );
}
