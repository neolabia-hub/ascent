'use client';

import type { ReactNode } from 'react';
import { ToastProvider } from '@/components/ui/toast';

/**
 * La consola del proveedor necesita su propio ToastProvider.
 *
 * El del producto vive dentro de `AppShell`, y ese armazon monta la sesion de un TENANT: resuelve
 * la empresa, pide el perfil y aplica los colores de marca. Aqui no hay empresa que resolver, asi
 * que reutilizarlo no era una opcion — solo hacia falta la pieza de los avisos, y es esta.
 *
 * Lo cazo el build al prerenderizar: "useToast debe usarse dentro de ToastProvider". Es justo para
 * lo que sirve que ese hook falle en voz alta en vez de devolver algo vacio.
 */
export default function PlataformaLayout({ children }: { children: ReactNode }) {
  return <ToastProvider>{children}</ToastProvider>;
}
