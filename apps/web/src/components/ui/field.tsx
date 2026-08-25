import { CircleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from './cn';
import { Label } from './label';

export interface FieldProps {
  htmlFor: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

export function Field({ htmlFor, label, hint, error, required, className, children }: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-0.5 text-danger">*</span> : null}
      </Label>
      {children}
      {error ? (
        <p className="flex items-center gap-1 text-xs text-danger">
          <CircleAlert className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-ink-500">{hint}</p>
      ) : null}
    </div>
  );
}
