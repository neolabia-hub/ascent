import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from './cn';

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-16 text-center', className)}>
      <div
        className="flex h-24 w-24 items-center justify-center rounded-full"
        style={{ backgroundColor: 'var(--brand-primary-soft)' }}
      >
        <Icon className="h-8 w-8" strokeWidth={1.75} style={{ color: 'var(--brand-primary)' }} />
      </div>
      <h3 className="mt-5 font-display text-base font-semibold text-ink-900">{title}</h3>
      {description ? <p className="mt-1.5 max-w-sm text-sm text-ink-500">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
