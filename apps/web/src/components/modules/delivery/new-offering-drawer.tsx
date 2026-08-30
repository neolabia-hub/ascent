'use client';

import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import { listCatalog, type CatalogRow } from '@/lib/admin-api';
import { listActivities, type ActivityListItem } from '@/lib/catalog-api';
import { createOffering, type OfferingDetail, type OfferingKind } from '@/lib/delivery-api';
import { MONTHS } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

/**
 * CREAR UNA CONVOCATORIA, desde donde haga falta.
 *
 * Vivia dentro de la pantalla de Convocatorias, y por eso planear el ano obligaba a salirse del
 * plan: crear la actividad, publicarla, ir a Convocatorias, crear la jornada y volver al plan a
 * buscarla en un desplegable de cien. Cuatro pantallas para un renglon.
 *
 * Sacado aqui, el plan puede crear la jornada sin moverse. Lo que NO cambia es el modelo: el plan
 * sigue REFERENCIANDO convocatorias, no poseyendolas (regla de oro 3). Crear desde el plan es un
 * atajo de interfaz —se crea la convocatoria y despues se agrega el renglon—, y los indicadores se
 * calculan igual que si se hubiera creado por el otro camino.
 */

interface PublishedVersionOption {
  versionId: string;
  label: string;
}

/** Solo se convoca contenido PUBLICADO: un borrador todavia puede cambiar. */
function publishedVersions(activities: ActivityListItem[]): PublishedVersionOption[] {
  return activities.flatMap((activity) => {
    const published = activity.versions.find((version) => version.status === 'PUBLISHED');
    return published ? [{ versionId: published.id, label: `${activity.name} (v${published.versionNumber})` }] : [];
  });
}

export interface NewOfferingDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Version fija: "otra jornada de esta misma capacitacion". Cuando viene, el selector se
   * sustituye por el nombre, porque ahi la pregunta ya esta contestada.
   */
  lockedVersion?: { id: string; label: string } | null;
  /** Desde el plan: se pide ademas el mes programado del renglon. */
  askPlanMonth?: boolean;
  defaultMonth?: number;
  /**
   * Desde un plan YA APROBADO: se pide el motivo, y sin el no se deja crear (Decision #55).
   * Se pregunta ANTES de crear nada, no despues: si se pidiera al final, una jornada podria
   * quedar creada y sin entrar al plan porque alguien cerro la ventana.
   */
  askJustification?: boolean;
  /** Se llama con la convocatoria ya creada. El mes viene null si no se pidio. */
  onCreated: (offering: OfferingDetail, plannedMonth: number | null, justification?: string) => Promise<void> | void;
}

export function NewOfferingDrawer({
  open,
  onOpenChange,
  lockedVersion = null,
  askPlanMonth = false,
  defaultMonth,
  askJustification = false,
  onCreated,
}: NewOfferingDrawerProps) {
  const [justification, setJustification] = useState('');
  const [versions, setVersions] = useState<PublishedVersionOption[]>([]);
  const [regionals, setRegionals] = useState<CatalogRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    activityVersionId: '',
    plannedMonth: String(defaultMonth ?? new Date().getMonth() + 1),
    kind: 'EVENT' as OfferingKind,
    modality: 'PRESENCIAL' as 'PRESENCIAL' | 'VIRTUAL' | 'HIBRIDA',
    scheduledDate: '',
    startTime: '08:00',
    endTime: '12:00',
    windowStart: '',
    windowEnd: '',
    intensityTheoryHours: '',
    intensityPracticeHours: '',
    location: '',
    regionalId: '',
    capacity: '',
  });

  // Se recarga al ABRIR y no al montar: entre una apertura y otra puede haberse publicado una
  // version nueva, y un desplegable desactualizado hace pensar que la actividad no existe.
  useEffect(() => {
    if (!open) return;
    setFormError(null);
    setJustification('');
    setForm((previous) => ({
      ...previous,
      activityVersionId: lockedVersion?.id ?? '',
      plannedMonth: String(defaultMonth ?? new Date().getMonth() + 1),
    }));
    void listActivities({ pageSize: 100 }).then((result) => setVersions(publishedVersions(result.items)));
    void listCatalog('regionals').then((rows) => setRegionals(rows.filter((row) => row.active)));
  }, [open, lockedVersion?.id, defaultMonth]);

  const isEvent = form.kind !== 'PERMANENT';
  const valid =
    Boolean(form.activityVersionId) &&
    (!isEvent || Boolean(form.scheduledDate)) &&
    (!isEvent || form.modality === 'VIRTUAL' || Boolean(form.location.trim())) &&
    // El servidor exige 10 caracteres; el boton se apaga aqui para no enterarse al enviar.
    (!askJustification || justification.trim().length >= 10);

  const submit = async () => {
    setCreating(true);
    setFormError(null);
    try {
      const offering = await createOffering({
        activityVersionId: form.activityVersionId,
        kind: form.kind,
        modality: form.modality,
        scheduledDate: isEvent ? form.scheduledDate : null,
        startTime: isEvent ? form.startTime : null,
        endTime: isEvent ? form.endTime : null,
        windowStart: form.windowStart || null,
        windowEnd: form.windowEnd || null,
        intensityTheoryHours: form.intensityTheoryHours ? Number(form.intensityTheoryHours) : null,
        intensityPracticeHours: form.intensityPracticeHours ? Number(form.intensityPracticeHours) : null,
        executedBy: 'PROPIOS',
        location: form.location || null,
        regionalId: form.regionalId || null,
        capacity: form.capacity ? Number(form.capacity) : null,
      });
      await onCreated(offering, askPlanMonth ? Number(form.plannedMonth) : null, askJustification ? justification.trim() : undefined);
      onOpenChange(false);
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : 'No se pudo crear la convocatoria');
    } finally {
      setCreating(false);
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={lockedVersion ? 'Otra jornada' : 'Nueva convocatoria'}
      description={
        askPlanMonth
          ? 'Se crea en borrador y entra al plan como renglon. Al publicarla se congelan los proyectados.'
          : 'Queda en borrador. Al publicarla se congelan los proyectados y se puede inscribir gente.'
      }
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} loading={creating} disabled={!valid}>
            {askPlanMonth ? 'Agregar al plan' : 'Crear convocatoria'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {askJustification ? (
          <Field
            htmlFor="o-justification"
            label="Por que se agrega al plan aprobado"
            required
            hint="Queda en la auditoria junto al renglon. Ejemplo: se abrio la regional de Neiva en agosto."
          >
            <Textarea
              id="o-justification"
              rows={2}
              value={justification}
              onChange={(event) => setJustification(event.target.value)}
              placeholder="Minimo 10 caracteres"
            />
          </Field>
        ) : null}

        {lockedVersion ? (
          <div className="rounded-lg border border-line bg-paper px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-[0.04em] text-ink-500">Capacitacion</p>
            <p className="mt-0.5 text-sm font-medium text-ink-900">{lockedVersion.label}</p>
          </div>
        ) : (
          <Field htmlFor="o-version" label="Version publicada" required hint="Solo aparece contenido ya publicado.">
            <Select
              id="o-version"
              value={form.activityVersionId}
              onChange={(event) => setForm({ ...form, activityVersionId: event.target.value })}
            >
              <option value="">Seleccionar...</option>
              {versions.map((version) => (
                <option key={version.versionId} value={version.versionId}>
                  {version.label}
                </option>
              ))}
            </Select>
          </Field>
        )}

        {askPlanMonth ? (
          <Field
            htmlFor="o-month"
            label="Mes programado"
            required
            hint="Es el mes que cuenta para el cumplimiento del plan, aunque la fecha exacta cambie despues."
          >
            <Select id="o-month" value={form.plannedMonth} onChange={(event) => setForm({ ...form, plannedMonth: event.target.value })}>
              {MONTHS.map((month, index) => (
                <option key={month} value={index + 1}>
                  {month}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Field htmlFor="o-kind" label="Forma" required>
            <Select id="o-kind" value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as OfferingKind })}>
              <option value="EVENT">Sesion programada</option>
              <option value="PERMANENT">Permanente (autoservicio)</option>
              <option value="HYBRID">Mixta</option>
            </Select>
          </Field>
          <Field htmlFor="o-modality" label="Modalidad" required>
            <Select
              id="o-modality"
              value={form.modality}
              onChange={(event) => setForm({ ...form, modality: event.target.value as typeof form.modality })}
            >
              <option value="PRESENCIAL">Presencial</option>
              <option value="VIRTUAL">Virtual</option>
              <option value="HIBRIDA">Hibrida</option>
            </Select>
          </Field>
        </div>

        {isEvent ? (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Field htmlFor="o-date" label="Fecha" required>
                <Input
                  id="o-date"
                  type="date"
                  value={form.scheduledDate}
                  onChange={(event) => setForm({ ...form, scheduledDate: event.target.value })}
                />
              </Field>
              <Field htmlFor="o-start" label="Inicio">
                <Input id="o-start" type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} />
              </Field>
              <Field htmlFor="o-end" label="Fin">
                <Input id="o-end" type="time" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field htmlFor="o-theory" label="Horas teoricas" hint="El desglose lo exige el PESV y suma para BPM.">
                <Input
                  id="o-theory"
                  type="number"
                  min={0}
                  step="0.5"
                  value={form.intensityTheoryHours}
                  onChange={(event) => setForm({ ...form, intensityTheoryHours: event.target.value })}
                />
              </Field>
              <Field htmlFor="o-practice" label="Horas practicas">
                <Input
                  id="o-practice"
                  type="number"
                  min={0}
                  step="0.5"
                  value={form.intensityPracticeHours}
                  onChange={(event) => setForm({ ...form, intensityPracticeHours: event.target.value })}
                />
              </Field>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field htmlFor="o-wstart" label="Disponible desde">
              <Input id="o-wstart" type="date" value={form.windowStart} onChange={(event) => setForm({ ...form, windowStart: event.target.value })} />
            </Field>
            <Field htmlFor="o-wend" label="Disponible hasta">
              <Input id="o-wend" type="date" value={form.windowEnd} onChange={(event) => setForm({ ...form, windowEnd: event.target.value })} />
            </Field>
          </div>
        )}

        {isEvent && form.modality !== 'VIRTUAL' ? (
          <Field htmlFor="o-location" label="Lugar" required>
            <Input id="o-location" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} maxLength={200} />
          </Field>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Field htmlFor="o-regional" label="Regional" hint="Si la eliges, los proyectados se acotan a esa sede.">
            <Select id="o-regional" value={form.regionalId} onChange={(event) => setForm({ ...form, regionalId: event.target.value })}>
              <option value="">Todas</option>
              {regionals.map((regional) => (
                <option key={regional.id} value={regional.id}>
                  {regional.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field htmlFor="o-capacity" label="Cupo">
            <Input
              id="o-capacity"
              type="number"
              min={1}
              value={form.capacity}
              onChange={(event) => setForm({ ...form, capacity: event.target.value })}
            />
          </Field>
        </div>

        {formError ? <p className="text-sm text-danger">{formError}</p> : null}
      </div>
    </Drawer>
  );
}
