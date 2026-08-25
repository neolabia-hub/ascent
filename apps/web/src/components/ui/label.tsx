import { forwardRef, type LabelHTMLAttributes } from 'react';
import { cn } from './cn';

export const Label = forwardRef<HTMLLabelElement, LabelHTMLAttributes<HTMLLabelElement>>(
  function Label({ className, ...props }, ref) {
    return (
      <label
        ref={ref}
        className={cn('block text-[13px] font-medium text-ink-700', className)}
        {...props}
      />
    );
  },
);
