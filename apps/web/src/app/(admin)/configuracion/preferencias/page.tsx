'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { applyTenantBranding } from '@/components/providers/tenant-provider';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import {
  getTenantBranding,
  getTenantSettings,
  putTenantBranding,
  putTenantSettings,
  type TenantBrandingSettings,
  type TenantSettings,
} from '@/lib/admin-api';

/**
 * Preferencias del tenant: reglas academicas (nota minima, intentos) y marca (colores, nombre).
 * Recordatorio visible: cambiar la nota minima NO reinterpreta evaluaciones ya presentadas
 * (la version publicada congela su snapshot — Decision #27).
 */
export default function PreferenciasPage() {
  const { showToast } = useToast();
  const [settings, setSettings] = useState<TenantSettings | null>(null);
  const [branding, setBranding] = useState<TenantBrandingSettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savingBranding, setSavingBranding] = useState(false);

  useEffect(() => {
    void getTenantSettings().then((r) => setSettings(r.settings)).catch(() => showToast({ kind: 'danger', title: 'No se pudieron cargar las preferencias' }));
    void getTenantBranding().then((r) => setBranding(r.branding)).catch(() => undefined);
  }, [showToast]);

  const saveSettings = async () => {
    if (!settings) return;
    setSavingSettings(true);
    try {
      const r = await putTenantSettings(settings);
      setSettings(r.settings);
      showToast({ kind: 'success', title: 'Preferencias guardadas' });
    } catch {
      showToast({ kind: 'danger', title: 'No se pudieron guardar las preferencias', description: 'Revisa los valores.' });
    } finally {
      setSavingSettings(false);
    }
  };

  const saveBranding = async () => {
    if (!branding) return;
    setSavingBranding(true);
    try {
      const r = await putTenantBranding(branding);
      setBranding(r.branding);
      // Aplica los colores de inmediato: el admin VE su marca sin recargar.
      applyTenantBranding({ ...r.branding, logoKey: r.branding.logoKey });
      showToast({ kind: 'success', title: 'Marca actualizada' });
    } catch {
      showToast({ kind: 'danger', title: 'No se pudo guardar la marca' });
    } finally {
      setSavingBranding(false);
    }
  };

  const num = (v: string, min: number, max: number, fallback: number): number => {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : fallback;
  };

  return (
    <div className="max-w-3xl">
      <Link href="/configuracion" className="focus-ring mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-700">
        <ArrowLeft size={14} />
        Configuracion
      </Link>
      <h1 className="font-display text-[28px] font-semibold text-ink-900">Preferencias y marca</h1>
      <p className="mt-1 text-sm text-ink-500">Reglas del negocio y identidad visual de la empresa en la plataforma.</p>

      <section className="card mt-6 p-6">
        <h2 className="font-display text-lg font-semibold">Reglas academicas</h2>
        <p className="mb-4 mt-1 text-sm text-ink-500">
          Valores por defecto para actividades nuevas. Cada actividad puede ajustarlos, y la version publicada congela
          su copia: cambiar esto no reinterpreta evaluaciones ya presentadas.
        </p>
        {!settings ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field htmlFor="pref-score" label="Nota minima de aprobacion (%)" hint="Transprensa exige 90.">
              <Input
                id="pref-score"
                type="number"
                min={1}
                max={100}
                value={settings.passingScoreDefault}
                onChange={(e) => setSettings({ ...settings, passingScoreDefault: num(e.target.value, 1, 100, 90) })}
              />
            </Field>
            <Field htmlFor="pref-attempts" label="Intentos maximos de evaluacion">
              <Input
                id="pref-attempts"
                type="number"
                min={1}
                max={10}
                value={settings.maxAttemptsDefault}
                onChange={(e) => setSettings({ ...settings, maxAttemptsDefault: num(e.target.value, 1, 10, 3) })}
              />
            </Field>
            <Field htmlFor="pref-wait" label="Espera entre intentos (horas)" hint="0 = sin espera.">
              <Input
                id="pref-wait"
                type="number"
                min={0}
                max={720}
                value={settings.retryWaitHours}
                onChange={(e) => setSettings({ ...settings, retryWaitHours: num(e.target.value, 0, 720, 0) })}
              />
            </Field>
            <Field htmlFor="pref-efficacy" label="Evaluacion de eficacia a los (dias)" hint="El jefe la responde pasado este plazo.">
              <Input
                id="pref-efficacy"
                type="number"
                min={1}
                max={180}
                value={settings.efficacyDaysDefault}
                onChange={(e) => setSettings({ ...settings, efficacyDaysDefault: num(e.target.value, 1, 180, 30) })}
              />
            </Field>
            <Field htmlFor="pref-pills" label="Pildoras por semana" hint="Cadencia gobernada por el sistema (2-3 recomendado).">
              <Input
                id="pref-pills"
                type="number"
                min={1}
                max={7}
                value={settings.pillCadencePerWeek}
                onChange={(e) => setSettings({ ...settings, pillCadencePerWeek: num(e.target.value, 1, 7, 3) })}
              />
            </Field>
            <Field htmlFor="pref-cap" label="Tope de notificaciones por semana" hint="Proteccion anti-spam por usuario.">
              <Input
                id="pref-cap"
                type="number"
                min={1}
                max={21}
                value={settings.notificationWeeklyCap}
                onChange={(e) => setSettings({ ...settings, notificationWeeklyCap: num(e.target.value, 1, 21, 5) })}
              />
            </Field>
          </div>
        )}
        <div className="mt-5 flex justify-end">
          <Button onClick={saveSettings} loading={savingSettings} disabled={!settings}>
            Guardar preferencias
          </Button>
        </div>
      </section>

      <section className="card mt-6 p-6">
        <h2 className="font-display text-lg font-semibold">Marca</h2>
        <p className="mb-4 mt-1 text-sm text-ink-500">
          El color del tenant se aplica a botones, enlaces y progreso. La estructura (fondos, textos) es de la
          plataforma y garantiza legibilidad.
        </p>
        {!branding ? (
          <Skeleton className="h-28 w-full" />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field htmlFor="brand-name" label="Nombre visible de la empresa">
              <Input
                id="brand-name"
                value={branding.companyDisplayName}
                maxLength={120}
                onChange={(e) => setBranding({ ...branding, companyDisplayName: e.target.value })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field htmlFor="brand-primary" label="Color primario">
                <input
                  id="brand-primary"
                  type="color"
                  value={branding.primaryColor}
                  onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
                  className="h-10 w-full cursor-pointer rounded-md border border-line bg-surface p-1"
                />
              </Field>
              <Field htmlFor="brand-accent" label="Color de acento">
                <input
                  id="brand-accent"
                  type="color"
                  value={branding.accentColor}
                  onChange={(e) => setBranding({ ...branding, accentColor: e.target.value })}
                  className="h-10 w-full cursor-pointer rounded-md border border-line bg-surface p-1"
                />
              </Field>
            </div>
          </div>
        )}
        <div className="mt-5 flex justify-end">
          <Button onClick={saveBranding} loading={savingBranding} disabled={!branding}>
            Guardar marca
          </Button>
        </div>
      </section>
    </div>
  );
}
