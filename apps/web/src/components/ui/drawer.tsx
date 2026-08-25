'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from './cn';

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/**
 * Panel lateral derecho, 480px, para crear/editar registros de catalogo.
 * NUNCA modal centrado ni pagina nueva (ver skill Pulso, seccion Admin).
 */
export function Drawer({ open, onOpenChange, title, description, children, footer }: DrawerProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            'fixed inset-0 z-40 bg-ink-900/40',
            'data-[state=open]:animate-overlay-in data-[state=closed]:animate-overlay-out',
          )}
        />
        <Dialog.Content
          className={cn(
            'fixed inset-y-0 right-0 z-50 flex w-full max-w-[480px] flex-col bg-surface shadow-card-hover focus:outline-none',
            'data-[state=open]:animate-drawer-in data-[state=closed]:animate-drawer-out',
          )}
        >
          <div className="flex items-center justify-between border-b border-line px-6 py-4">
            <div>
              <Dialog.Title className="font-display text-lg font-semibold text-ink-900">
                {title}
              </Dialog.Title>
              {description ? (
                <Dialog.Description className="mt-0.5 text-sm text-ink-500">
                  {description}
                </Dialog.Description>
              ) : null}
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Cerrar"
                className="focus-ring rounded-md p-1.5 text-ink-500 transition-colors duration-150 hover:bg-paper hover:text-ink-900"
              >
                <X className="h-5 w-5" strokeWidth={1.75} />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

          {footer ? (
            <div className="flex items-center justify-end gap-3 border-t border-line px-6 py-4">
              {footer}
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
