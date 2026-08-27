'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { getPublicTenant, me, refresh, setAccessToken, type MeResponse } from '@/lib/api';
import { LEARNER_HOME, isLearnerOnly } from '@/lib/landing';
import { resolveTenantSlug } from '@/lib/tenant';
import { TenantProvider, applyTenantBranding, type TenantContextValue } from '@/components/providers/tenant-provider';
import { ToastProvider } from '@/components/ui/toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

const BREADCRUMB_LABELS: Record<string, string> = {
  inicio: 'Inicio',
  'contenido-formativo': 'Contenido formativo',
  convocatorias: 'Convocatorias',
  plan: 'Plan',
  personas: 'Personas',
  aprobaciones: 'Aprobaciones',
  reportes: 'Reportes',
  configuracion: 'Configuracion',
};

function breadcrumbFromPathname(pathname: string | null): string {
  const segment = pathname?.split('/').filter(Boolean)[0] ?? '';
  return BREADCRUMB_LABELS[segment] ?? 'Inicio';
}

function ShellSkeleton() {
  return (
    <div className="flex h-screen w-full">
      <div className="flex h-full w-[248px] shrink-0 flex-col gap-2 bg-ink-900 p-4">
        <Skeleton className="h-8 w-8 rounded-md bg-white/10" />
        <div className="mt-6 space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-9 w-full rounded-md bg-white/10" />
          ))}
        </div>
      </div>
      <div className="flex flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center border-b border-line bg-surface px-6">
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="flex-1 space-y-4 p-8">
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
  const pathname = usePathname();
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
      <ToastProvider>
        <div className="flex h-screen w-full overflow-hidden bg-paper">
          <Sidebar userFullName={session.profile.fullName} />
          <div className="flex min-w-0 flex-1 flex-col">
            <Topbar breadcrumb={breadcrumbFromPathname(pathname)} userFullName={session.profile.fullName} />
            <main className="flex-1 overflow-y-auto">
              <div className="mx-auto max-w-[1280px] px-8 py-8">{children}</div>
            </main>
          </div>
        </div>
      </ToastProvider>
    </TenantProvider>
  );
}
