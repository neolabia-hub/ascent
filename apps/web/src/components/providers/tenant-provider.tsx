'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { TenantBranding } from '@/lib/api';

export interface TenantContextValue {
  slug: string;
  /** El nombre INTERNO del tenant (el de alta). Para enseñarlo, `displayName`. */
  name: string;
  branding: TenantBranding;
}

const TenantContext = createContext<(TenantContextValue & { displayName: string }) | null>(null);

/** Se emite al guardar la marca: el proveedor la toma sin recargar. Ver `avisarMarcaNueva`. */
const EVENTO_MARCA = 'np:marca-actualizada';

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

/**
 * QUIEN GUARDA LA MARCA AVISA (2026-09-30), y la barra y el resto la toman al momento. Los colores
 * ya se aplicaban al instante —van por variables CSS— pero el nombre y el logo seguian los de antes
 * hasta recargar, y parecia que no se habian guardado.
 */
export function avisarMarcaNueva(branding: TenantBranding): void {
  applyTenantBranding(branding);
  window.dispatchEvent(new CustomEvent<TenantBranding>(EVENTO_MARCA, { detail: branding }));
}

export function TenantProvider({
  value,
  children,
}: {
  value: TenantContextValue;
  children: ReactNode;
}) {
  const [marcaNueva, setMarcaNueva] = useState<TenantBranding | null>(null);

  useEffect(() => {
    const escuchar = (event: Event) => setMarcaNueva((event as CustomEvent<TenantBranding>).detail);
    window.addEventListener(EVENTO_MARCA, escuchar);
    return () => window.removeEventListener(EVENTO_MARCA, escuchar);
  }, []);

  /*
    `displayName`: EL NOMBRE QUE SE ENSEÑA (2026-09-30). Es el «Nombre visible de la empresa» de la
    marca, o el interno si esta vacio. La barra, el perfil y el reproductor pintaban `name`, asi que
    cambiar el nombre visible en Preferencias no se veia en ninguna parte salvo el login y las
    constancias — el cliente lo reporto como «no cambia».
  */
  const memoized = useMemo(() => {
    const branding = marcaNueva ?? value.branding;
    return { ...value, branding, displayName: branding.companyDisplayName?.trim() || value.name };
  }, [value, marcaNueva]);
  return <TenantContext.Provider value={memoized}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantContextValue & { displayName: string } {
  const context = useContext(TenantContext);
  if (!context) {
    throw new Error('useTenant debe usarse dentro de TenantProvider');
  }
  return context;
}
