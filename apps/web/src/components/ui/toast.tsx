'use client';

import { CircleCheck, CircleX, Info, TriangleAlert, X } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { cn } from './cn';

export type ToastKind = 'success' | 'warning' | 'danger' | 'info';

export interface ToastInput {
  kind?: ToastKind;
  title: string;
  description?: string;
}

interface ToastItem extends Required<Pick<ToastInput, 'title'>> {
  id: number;
  kind: ToastKind;
  description?: string;
}

interface ToastContextValue {
  showToast: (toast: ToastInput) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_DURATION_MS = 3500;

const iconByKind: Record<ToastKind, typeof CircleCheck> = {
  success: CircleCheck,
  warning: TriangleAlert,
  danger: CircleX,
  info: Info,
};

const colorByKind: Record<ToastKind, string> = {
  success: 'text-ok',
  warning: 'text-warn',
  danger: 'text-danger',
  info: 'text-info',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    ({ kind = 'info', title, description }: ToastInput) => {
      const id = nextId.current++;
      setToasts((current) => [...current, { id, kind, title, description }]);
      window.setTimeout(() => dismiss(id), TOAST_DURATION_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((toast) => {
          const Icon = iconByKind[toast.kind];
          return (
            <div
              key={toast.id}
              role="status"
              className="card pointer-events-auto flex items-start gap-3 p-4 animate-card-in"
            >
              <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', colorByKind[toast.kind])} strokeWidth={1.75} />
              <div className="flex-1">
                <p className="text-sm font-semibold text-ink-900">{toast.title}</p>
                {toast.description ? (
                  <p className="mt-0.5 text-sm text-ink-500">{toast.description}</p>
                ) : null}
              </div>
              <button
                type="button"
                aria-label="Cerrar notificación"
                onClick={() => dismiss(toast.id)}
                className="focus-ring rounded-md p-0.5 text-ink-300 transition-colors duration-150 hover:text-ink-700"
              >
                <X className="h-4 w-4" strokeWidth={1.75} />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast debe usarse dentro de ToastProvider');
  }
  return context;
}
