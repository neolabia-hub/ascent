'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { logout, me, refresh, setAccessToken, type MeResponse } from '@/lib/api';

export default function InicioPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<MeResponse | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        const result = await me();
        if (!cancelled) {
          setProfile(result);
        }
      } catch {
        try {
          const refreshed = await refresh();
          setAccessToken(refreshed.accessToken);
          const result = await me();
          if (!cancelled) {
            setProfile(result);
          }
        } catch {
          if (!cancelled) {
            router.push('/login');
          }
        }
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      setAccessToken(null);
      router.push('/login');
    }
  }

  if (!profile) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <p className="text-sm text-gray-500">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-xl font-semibold text-gray-900">Hola, {profile.fullName}</h1>
        <p className="mt-2 text-sm text-gray-500">Sprint 0 — plataforma en construccion.</p>
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loggingOut ? 'Cerrando sesion...' : 'Cerrar sesion'}
        </button>
      </div>
    </div>
  );
}
