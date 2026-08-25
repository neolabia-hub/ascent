'use client';

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { TenantBranding } from '@/lib/api';

export interface TenantContextValue {
  slug: string;
  name: string;
  branding: TenantBranding;
}

const TenantContext = createContext<TenantContextValue | null>(null);

/**
 * Aplica el branding del tenant como variables CSS de la capa TENANT
 * (ver skill Pulso: "el tenant colorea, la plataforma estructura").
 * Debe llamarse antes de renderizar el AppShell para evitar parpadeo de color.
 */
export function applyTenantBranding(branding: TenantBranding): void {
  const root = document.documentElement;
  root.style.setProperty('--brand-primary', branding.primaryColor);
  root.style.setProperty('--brand-accent', branding.accentColor);
}

export function TenantProvider({
  value,
  children,
}: {
  value: TenantContextValue;
  children: ReactNode;
}) {
  const memoized = useMemo(() => value, [value]);
  return <TenantContext.Provider value={memoized}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantContextValue {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant debe usarse dentro de TenantProvider');
  }
  return context;
}
