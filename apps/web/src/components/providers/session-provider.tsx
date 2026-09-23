'use client';

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import type { MeResponse } from '@/lib/api';

/**
 * QUIEN ESTA MIRANDO, y que puede hacer.
 *
 * El AppShell ya pedia el perfil para decidir si dejarte entrar, pero se lo guardaba: las
 * pantallas no tenian forma de saber los permisos de quien las abre, asi que ensenaban todos los
 * botones a todo el mundo. El Analista veia "Aprobar plan" —un permiso que su rol no tiene— y se
 * enteraba de que no podia al pulsarlo, con un 403 seco.
 *
 * Ofrecer una accion prohibida no es un detalle estetico: es prometer algo que no se va a cumplir.
 * Y esconderla NO es la seguridad —esa vive en los guards del servidor, que siguen mandando—; es
 * decir la verdad sobre lo que esta persona puede hacer aqui.
 */
const SessionContext = createContext<MeResponse | null>(null);

export function SessionProvider({ value, children }: { value: MeResponse; children: ReactNode }) {
  const memoized = useMemo(() => value, [value]);
  return <SessionContext.Provider value={memoized}>{children}</SessionContext.Provider>;
}

export function useSession(): MeResponse {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useSession debe usarse dentro de SessionProvider');
  }
  return context;
}

/**
 * `can('plans:approve')` — un solo permiso, el mismo codigo que evalua el servidor.
 *
 * Se comparan CODIGOS y nunca nombres de rol, igual que en la API (Decision #19): los roles son
 * configurables por empresa y un `rol === 'ADMIN'` en la interfaz se rompe en cuanto un cliente
 * llama distinto al suyo.
 *
 * La funcion es ESTABLE mientras no cambie la sesion (`useCallback`), y no por gusto: quien arma
 * una lista derivada de permisos —el menu lateral, sin ir mas lejos— la pone como dependencia de un
 * `useMemo`, y una funcion nueva en cada render lo recalcularia siempre.
 */
export function useCan(): (permission: string) => boolean {
  const session = useContext(SessionContext);
  const permissions = useMemo(() => new Set(session?.permissions ?? []), [session]);
  return useCallback((permission: string) => permissions.has(permission), [permissions]);
}
