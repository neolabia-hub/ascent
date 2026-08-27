'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { resolveTenantSlug } from '@/lib/tenant';
import { ApiError, getPublicTenant, login, me, setAccessToken, type TenantBranding } from '@/lib/api';
import { ADMIN_HOME, landingFor } from '@/lib/landing';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';

type BrandingState =
  | { status: 'loading' }
  | { status: 'ready'; tenantSlug: string; branding: TenantBranding }
  | { status: 'not_found' };

function applyBranding(branding: TenantBranding): void {
  document.documentElement.style.setProperty('--brand-primary', branding.primaryColor);
  document.documentElement.style.setProperty('--brand-accent', branding.accentColor);
}

export function LoginForm() {
  const router = useRouter();
  const [brandingState, setBrandingState] = useState<BrandingState>({ status: 'loading' });
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const tenantSlug = resolveTenantSlug(window.location.host, new URLSearchParams(window.location.search));

    getPublicTenant(tenantSlug)
      .then((tenant) => {
        applyBranding(tenant.branding);
        setBrandingState({ status: 'ready', tenantSlug, branding: tenant.branding });
      })
      .catch(() => {
        setBrandingState({ status: 'not_found' });
      });
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (brandingState.status !== 'ready') {
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await login(brandingState.tenantSlug, identifier, password);
      setAccessToken(response.accessToken);

      if (response.user.mustChangePassword) {
        router.push('/cambiar-contrasena');
      } else if (!response.user.activated) {
        router.push('/activacion');
      } else {
        // A donde entra depende de lo que PUEDE hacer: el rol Usuario solo tiene su propia
        // formacion, y el panel de administracion seria una pantalla donde todo esta prohibido.
        const profile = await me().catch(() => null);
        router.push(profile ? landingFor(profile.permissions) : ADMIN_HOME);
      }
    } catch (error) {
      if (error instanceof ApiError && error.code === 'INVALID_CREDENTIALS') {
        setErrorMessage('Cedula/correo o contraseña incorrectos.');
      } else if (error instanceof ApiError && error.code === 'ACCOUNT_LOCKED') {
        const minutes = error.retryAfter ? Math.max(1, Math.ceil(error.retryAfter / 60)) : null;
        setErrorMessage(
          minutes
            ? `Cuenta bloqueada temporalmente. Intenta de nuevo en ${minutes} minutos.`
            : 'Cuenta bloqueada temporalmente. Intenta de nuevo mas tarde.',
        );
      } else {
        setErrorMessage('No se pudo iniciar sesion. Intenta de nuevo.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (brandingState.status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper px-4">
        <p className="text-sm text-ink-500">Cargando...</p>
      </div>
    );
  }

  if (brandingState.status === 'not_found') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper px-4">
        <p className="text-sm text-ink-700">Empresa no encontrada.</p>
      </div>
    );
  }

  const { branding } = brandingState;

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="font-display text-xl font-semibold text-ink-900">{branding.companyDisplayName}</h1>
          <p className="mt-1 text-sm text-ink-500">Plataforma de formacion NEO PULSE</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4 p-6">
          <Field htmlFor="identifier" label="Cedula o correo">
            <Input
              id="identifier"
              name="identifier"
              type="text"
              autoComplete="username"
              required
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
            />
          </Field>

          <Field htmlFor="password" label="Contraseña">
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </Field>

          {errorMessage ? (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
              {errorMessage}
            </p>
          ) : null}

          <Button type="submit" loading={submitting} className="w-full">
            {submitting ? 'Ingresando...' : 'Ingresar'}
          </Button>
        </form>
      </div>
    </div>
  );
}
