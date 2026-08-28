import type { ReactNode } from 'react';
import { LearnerSession } from '@/components/layout/learner-session';

/**
 * Grupo del REPRODUCTOR: sesion sin chrome.
 *
 * Aqui no hay carril lateral ni barra superior, y es deliberado: mientras alguien esta cursando,
 * cada elemento de navegacion en pantalla es una invitacion a irse. El unico control es la salida.
 *
 * OJO con la diferencia: la FICHA de la formacion (`/aprender/[id]`) no es inmersiva —es una
 * pantalla para decidir que hacer— y por eso ella si monta el chrome del aprendiz por su cuenta.
 * Inmersivo es el contenido, no la formacion entera.
 */
export default function PlayerLayout({ children }: { children: ReactNode }) {
  return <LearnerSession>{children}</LearnerSession>;
}
