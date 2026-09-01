'use client';

import { LogOut, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  getPlatformSettings,
  platformLogout,
  platformRestore,
  putPlatformSettings,
  type PlatformActor,
  type PlatformSettings,
} from '@/lib/platform-api';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';

/**
 * LA CONSOLA DEL PROVEEDOR (Decision #100).
 *
 * Hoy tiene una sola cosa: los datos de contacto que ven los clientes que no han puesto los suyos.
 * Es poco a proposito — el modulo de administracion de clientes (listar, dar de alta, suspender,
 * ver consumo) viene despues—, pero lo que ya esta puesto es lo que no se puede improvisar luego:
 * la cuenta fuera de los tenants, su ingreso y su token. Anadir pantallas encima de eso es barato;
 * migrar sesiones vivas a otra clase de cuenta, no.
 */
export default function PlataformaPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [actor, setActor] = useState<PlatformActor | null>(null);
  const [cargando, setCargando] = useState(true);
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let cancelado = false;
    void (async () => {
      const sesion = await platformRestore();
      if (cancelado) return;
      if (!sesion) {
        router.replace('/plataforma/login');
        return;
      }
      setActor(sesion);
      const { settings: cargados } = await getPlatformSettings().catch(() => ({ settings: null }));
      if (!cancelado) {
        setSettings(cargados);
        setCargando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [router]);

  async function guardar() {
    if (!settings) return;
    setGuardando(true);
    try {
      const { settings: guardados } = await putPlatformSettings(settings);
      setSettings(guardados);
      showToast({ kind: 'success', title: 'Datos de contacto guardados' });
    } catch {
      showToast({ kind: 'danger', title: 'No se pudieron guardar' });
    } finally {
      setGuardando(false);
    }
  }

  async function salir() {
    await platformLogout().catch(() => undefined);
    router.replace('/plataforma/login');
  }

  if (cargando) {
    return (
      <div className="min-h-screen bg-paper px-6 py-10">
        <div className="mx-auto max-w-2xl space-y-4">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-900 text-white"
            >
              <ShieldCheck className="h-5 w-5" strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <p className="truncate font-display text-base font-bold leading-tight text-ink-900">NEO PULSE</p>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-500">Plataforma</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => void salir()}>
            <LogOut className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Salir
          </Button>
        </header>

        <h1 className="mt-8 font-display text-[28px] font-semibold text-ink-900">Tus datos de contacto</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-500">
          Salen en &quot;No puedo entrar&quot; de los clientes que no hayan puesto un contacto propio.
          {actor ? <> Entraste como {actor.fullName}.</> : null}
        </p>

        {/*
          LA ADVERTENCIA ARRIBA, porque es lo que cambia lo que se escribe. Un texto mal puesto aqui
          no ensucia una pantalla: ensucia la de TODOS los clientes sin contacto propio a la vez, y
          la pantalla de ingreso se ve sin haber iniciado sesion.
        */}
        <p className="mt-5 rounded-lg border border-warn/30 bg-warn-soft px-3.5 py-3 text-sm leading-relaxed text-ink-700">
          Esto lo ve cualquiera que abra la pantalla de ingreso de un cliente, <strong>sin sesion</strong>.
          Pon un canal de soporte, no datos personales.
        </p>

        <section className="card mt-6 p-6">
          {!settings ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field htmlFor="ps-name" label="Como te presentas" hint="Ej.: Soporte NEO PULSE.">
                <Input
                  id="ps-name"
                  maxLength={120}
                  value={settings.supportName}
                  onChange={(e) => setSettings({ ...settings, supportName: e.target.value })}
                />
              </Field>
              <Field htmlFor="ps-email" label="Correo de soporte">
                <Input
                  id="ps-email"
                  type="email"
                  maxLength={160}
                  value={settings.supportEmail}
                  onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
                />
              </Field>
              <Field htmlFor="ps-phone" label="Telefono">
                <Input
                  id="ps-phone"
                  maxLength={60}
                  value={settings.supportPhone}
                  onChange={(e) => setSettings({ ...settings, supportPhone: e.target.value })}
                />
              </Field>
              <Field htmlFor="ps-note" label="Nota (opcional)" hint="Horario de atencion, por ejemplo.">
                <Input
                  id="ps-note"
                  maxLength={300}
                  value={settings.supportNote}
                  onChange={(e) => setSettings({ ...settings, supportNote: e.target.value })}
                />
              </Field>
            </div>
          )}

          <div className="mt-5 flex justify-end">
            <Button onClick={() => void guardar()} loading={guardando} disabled={!settings} glow>
              Guardar
            </Button>
          </div>
        </section>

        <p className="mt-6 text-sm leading-relaxed text-ink-500">
          Cuando un cliente configura su propio contacto en Configuracion, el suyo manda y esto deja
          de verse en esa empresa. Es lo deseable: quien puede restablecer una contraseña de verdad
          es quien administra alli.
        </p>
      </div>
    </div>
  );
}
