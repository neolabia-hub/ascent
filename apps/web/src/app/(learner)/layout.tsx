import type { ReactNode } from 'react';
import { LearnerSession } from '@/components/layout/learner-session';
import { LearnerShell } from '@/components/layout/learner-shell';

/**
 * Superficie del APRENDIZ. Grupo de rutas separado del panel `(admin)` a proposito: comparten
 * sesion y tenant, pero no comparten ni chrome, ni densidad, ni vocabulario.
 */
export default function LearnerLayout({ children }: { children: ReactNode }) {
  return (
    <LearnerSession>
      <LearnerShell>{children}</LearnerShell>
    </LearnerSession>
  );
}
