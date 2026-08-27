'use client';

import { useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { getPublicTenant, me, refresh, setAccessToken, type MeResponse } from '@/lib/api';
import { resolveTenantSlug } from '@/lib/tenant';
import { ServiceWorkerBridge } from '@/components/providers/service-worker-bridge';
import { TenantProvider, applyTenantBranding, type TenantContextValue } from '@/components/providers/tenant-provider';
import { ToastProvider } from '@/components/ui/toast';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * La puerta de entrada de la superficie del APRENDIZ. Hace lo mismo que `AppShell` con la sesion
 * (recuperar el access token con la cookie de refresh, resolver el tenant, aplicar su color) pero
 * NO dibuja el chrome de administracion: aqui manda la barra inferior, no la lateral.
 *
 * Se separa en un componente propio porque el reproductor a pantalla completa necesita la misma
 * sesion sin ninguna barra encima.
 */

const ProfileContext = createContext<MeResponse | null>(null);

export function useLearnerProfile(): MeResponse {
  const profile = useContext(ProfileContext);
  if (!profile) {
    throw new Error('useLearnerProfile debe usarse dentro de LearnerSession');
  }
  return profile;
}

type SessionState =
  | { status: 'loading' }
  | { status: 'ready'; profile: MeResponse; tenant: TenantContextValue }
  | { status: 'redirecting' };

function SessionSkeleton() {
  return (
    <div className="learner-surface min-h-screen bg-paper px-5 py-6">
      <div className="mx-auto max-w-md space-y-5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-8 w-20 rounded-full" />
        </div>
        <Skeleton className="h-36 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-xl" />
      </div>
    </div>
  );
}

export function LearnerSession({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<SessionState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function resolveProfile(): Promise<MeResponse | null> {
      try {
        return await me();
      } catch {
        try {
          const refreshed = await refresh();
          setAccessToken(refreshed.accessToken);
          return await me();
        } catch {
          return null;
        }
      }
    }

    async function bootstrap() {
      const profile = await resolveProfile();
      if (cancelled) return;

      if (!profile) {
        setSession({ status: 'redirecting' });
        router.push('/login');
        return;
      }
      if (profile.mustChangePassword) {
        router.push('/cambiar-contrasena');
        return;
      }
      if (!profile.activated) {
        router.push('/activacion');
        return;
      }

      const slug = resolveTenantSlug(window.location.host, new URLSearchParams(window.location.search));
      try {
        const publicTenant = await getPublicTenant(slug);
        if (cancelled) return;
        applyTenantBranding(publicTenant.branding);
        setSession({
          status: 'ready',
          profile,
          tenant: { slug, name: publicTenant.name, branding: publicTenant.branding },
        });
      } catch {
        if (!cancelled) {
          setSession({ status: 'redirecting' });
          router.push('/login');
        }
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (session.status !== 'ready') {
    return <SessionSkeleton />;
  }

  return (
    <TenantProvider value={session.tenant}>
      <ProfileContext.Provider value={session.profile}>
        <ToastProvider>
          <ServiceWorkerBridge />
          {children}
        </ToastProvider>
      </ProfileContext.Provider>
    </TenantProvider>
  );
}
