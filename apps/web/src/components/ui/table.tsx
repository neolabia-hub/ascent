import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { cn } from './cn';

export function Table({ className, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto rounded-lg border border-line bg-surface">
      <table className={cn('w-full border-collapse text-left text-sm', className)} {...props} />
    </div>
  );
}

export function THead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('border-b border-line bg-paper', className)} {...props} />;
}

export function TBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('divide-y divide-line', className)} {...props} />;
}

export function Tr({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('h-10 transition-colors duration-150 hover:bg-paper', className)} {...props} />;
}

export function Th({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th
      className={cn(
        'px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.04em] text-ink-500',
        className,
      )}
      {...props}
    />
  );
}

export function Td({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-4 py-2 text-sm text-ink-900', className)} {...props} />;
}

export interface TablePaginationProps {
  from: number;
  to: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
  canPrevious: boolean;
  canNext: boolean;
}

export function TablePagination({
  from,
  to,
  total,
  onPrevious,
  onNext,
  canPrevious,
  canNext,
}: TablePaginationProps) {
  return (
    <div className="flex items-center justify-between border-t border-line px-4 py-3">
      <p className="text-sm text-ink-500">
        {total === 0 ? '0 de 0' : `${from}-${to} de ${total}`}
      </p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={onPrevious}
          disabled={!canPrevious}
          aria-label="Anterior"
          className="focus-ring flex h-8 w-8 items-center justify-center rounded-md border border-line-strong text-ink-700 transition-colors duration-150 hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={!canNext}
          aria-label="Siguiente"
          className="focus-ring flex h-8 w-8 items-center justify-center rounded-md border border-line-strong text-ink-700 transition-colors duration-150 hover:bg-paper disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRight className="h-4 w-4" strokeWidth={1.75} />
        </button>
      </div>
    </div>
  );
}
