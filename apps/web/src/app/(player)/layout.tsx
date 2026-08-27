import type { ReactNode } from 'react';
import { LearnerSession } from '@/components/layout/learner-session';

/**
 * El REPRODUCTOR va en su propio grupo de rutas: comparte sesion con el resto de la superficie
 * del aprendiz, pero no lleva barra inferior ni cabecera. Mientras alguien esta cursando, lo
 * unico que debe haber en pantalla es el contenido y una salida (skill pulse-ui, seccion 2).
 */
export default function PlayerLayout({ children }: { children: ReactNode }) {
  return <LearnerSession>{children}</LearnerSession>;
}
