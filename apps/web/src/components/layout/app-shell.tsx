'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { getPublicTenant, me, refresh, setAccessToken, type MeResponse, onSessionLost } from '@/lib/api';
import { LEARNER_HOME, isLearnerOnly } from '@/lib/landing';
import { resolveTenantSlug } from '@/lib/tenant';
import { SessionProvider } from '@/components/providers/session-provider';
import { TenantProvider, applyTenantBranding, type TenantContextValue } from '@/components/providers/tenant-provider';
import { ToastProvider } from '@/components/ui/toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

/*
  EL ESQUELETO TIENE QUE SER LA MISMA PANTALLA que va a aparecer despues (Decision #98).

  Se quedo dibujando la barra lateral OSCURA y la barra superior con filo que ya no existen, asi
  que cada carga enseñaba medio segundo del diseño viejo y despues saltaba al nuevo. Un esqueleto
  que no coincide con lo que llega es peor que no tener esqueleto: promete una cosa y entrega otra,
  y ese salto se lee como que la aplicacion se recargo sola.
*/
function ShellSkeleton() {
  return (
    <div className="flex h-screen w-full bg-paper">
      <div className="hidden w-[264px] shrink-0 p-3 lg:block">
        <div className="flex h-full flex-col rounded-3xl border border-line bg-surface p-4 shadow-card">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <div className="mt-6 space-y-2">
            {Array.from({ length: 7 }).map((_, index) => (
              <Skeleton key={index} className="h-9 w-full rounded-md" />
            ))}
          </div>
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-16 shrink-0 items-center justify-between gap-4 px-6">
          <Skeleton className="h-4 w-32" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-10 w-10 rounded-full" />
            <Skeleton className="h-10 w-10 rounded-full" />
            <Skeleton className="h-10 w-32 rounded-full" />
          </div>
        </div>
        <div className="mx-auto w-full max-w-[1280px] flex-1 space-y-4 px-8 py-8">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    </div>
  );
}

type SessionState =
  | { status: 'loading' }
  | { status: 'ready'; profile: MeResponse; tenant: TenantContextValue }
  | { status: 'redirecting' };

export function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<SessionState>({ status: 'loading' });

  /*
    LA SESION MURIO DE VERDAD (Decision #91). `apiFetch` ya intenta renovarla sola ante un 401;
    solo avisa por aqui cuando ni con el refresco se pudo, que es cuando toca ir al login. Antes no
    habia nada de esto: a los 15 minutos el token caducaba y la pantalla se quedaba muerta.
  */
  useEffect(() => {
    onSessionLost(() => router.push('/login'));
    return () => onSessionLost(null);
  }, [router]);

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
      if (cancelled) {
        return;
      }
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
      // Quien solo tiene su propia formacion no entra al panel: aqui no podria hacer nada.
      if (isLearnerOnly(profile.permissions)) {
        setSession({ status: 'redirecting' });
        router.push(LEARNER_HOME);
        return;
      }

      const slug = resolveTenantSlug(window.location.host, new URLSearchParams(window.location.search));
      try {
        const publicTenant = await getPublicTenant(slug);
        if (cancelled) {
          return;
        }
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
    return <ShellSkeleton />;
  }

  return (
    <TenantProvider value={session.tenant}>
      <SessionProvider value={session.profile}>
        <ToastProvider>
          <div className="flex h-screen w-full overflow-hidden bg-paper">
            <Sidebar />
            <div className="flex min-w-0 flex-1 flex-col">
              <Topbar userFullName={session.profile.fullName} />
              <main className="flex-1 overflow-y-auto">
                <div className="mx-auto max-w-[1280px] px-8 py-8">{children}</div>
              </main>
            </div>
          </div>
        </ToastProvider>
      </SessionProvider>
    </TenantProvider>
  );
}
