import type { LucideIcon } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';

export interface ComingSoonProps {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  /** Que se va a poder hacer aqui y en que sprint llega. */
  sprint: string;
}

/** Marcador honesto de una seccion aun no construida (mejor que un 404 o una pantalla muda). */
export function ComingSoon({ icon, title, subtitle, sprint }: ComingSoonProps) {
  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-[28px] font-semibold text-ink-900">{title}</h1>
        <p className="mt-1 text-sm text-ink-500">{subtitle}</p>
      </div>
      <div className="card">
        <EmptyState icon={icon} title="Seccion en construccion" description={sprint} />
      </div>
    </div>
  );
}
