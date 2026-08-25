'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { resolveTenantSlug } from '@/lib/tenant';
import { ApiError, getPublicTenant, login, setAccessToken, type TenantBranding } from '@/lib/api';

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
        router.push('/inicio');
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
      <div className="flex min-h-screen items-center justify-center px-4">
        <p className="text-sm text-gray-500">Cargando...</p>
      </div>
    );
  }

  if (brandingState.status === 'not_found') {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <p className="text-sm text-gray-600">Empresa no encontrada.</p>
      </div>
    );
  }

  const { branding } = brandingState;

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-semibold text-gray-900">{branding.companyDisplayName}</h1>
          <p className="mt-1 text-sm text-gray-500">Plataforma de formacion NEO PULSE</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div>
            <label htmlFor="identifier" className="block text-sm font-medium text-gray-700">
              Cedula o correo
            </label>
            <input
              id="identifier"
              name="identifier"
              type="text"
              autoComplete="username"
              required
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {errorMessage ? (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {errorMessage}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  );
}
