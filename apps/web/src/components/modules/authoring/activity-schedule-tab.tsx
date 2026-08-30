'use client';

import { CalendarDays, CalendarPlus } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { listCatalog, listPickableUsers, type CatalogRow, type PickableUser } from '@/lib/admin-api';
import {
  createOffering,
  isOutdatedVersion,
  listOfferings,
  type ExecutedBy,
  type OfferingKind,
  type OfferingListItem,
} from '@/lib/delivery-api';
import type { Modality } from '@/lib/catalog-api';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';

/**
 * PROGRAMACION — cuando, donde y quien la dicta.
 *
 * Aqui viven los campos del formulario de siempre que CAMBIAN cada vez que la formacion se
 * repite: fecha, intensidad horaria, instructor, ejecutada por, lugar, cupo y observaciones.
 * Estan separados de la ficha por una razon practica: la misma "Induccion general" se dicta en
 * marzo en Bogota y en julio en Neiva, y duplicar la formacion entera para eso es exactamente
 * el problema que tenia el Excel.
 *
 * Una formacion virtual de autoservicio tambien necesita una programacion: es la convocatoria
 * PERMANENTE, sin fecha, que habilita a la gente a empezarla por su cuenta.
 */
export function ActivityScheduleTab({
  activityId,
  publishedVersionId,
  activityModality,
}: {
  activityId: string;
  publishedVersionId: string | null;
  activityModality: Modality;
}) {
  const { showToast } = useToast();
  const [rows, setRows] = useState<OfferingListItem[] | null>(null);
  const [people, setPeople] = useState<PickableUser[]>([]);
  const [regionals, setRegionals] = useState<CatalogRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState({
    kind: 'PERMANENT' as OfferingKind,
    modality: activityModality,
    scheduledDate: '',
    startTime: '',
    endTime: '',
    windowStart: '',
    windowEnd: '',
    intensityTheoryHours: '',
    intensityPracticeHours: '',
    instructorUserId: '',
    instructorExternalName: '',
    executedBy: 'PROPIOS' as ExecutedBy,
    executedByOther: '',
    location: '',
    regionalId: '',
    capacity: '',
    observations: '',
  });

  const load = useCallback(async () => {
    try {
      const page = await listOfferings({ activityId, pageSize: 50 });
      setRows(page.items);
    } catch {
      setRows([]);
    }
  }, [activityId]);

  useEffect(() => {
    void load();
    // `listUsers({ pageSize: 200 })` devolvia 422 SIEMPRE (el servidor topa en 100) y el catch
    // vacio lo escondia: el desplegable salia sin nadie dentro y parecia que no habia personas.
    void listPickableUsers().then(setPeople).catch(() => undefined);
    void listCatalog('regionals').then(setRegionals).catch(() => undefined);
  }, [load]);

  const isEvent = form.kind === 'EVENT' || form.kind === 'HYBRID';
  const isPermanent = form.kind === 'PERMANENT' || form.kind === 'HYBRID';

  const submit = async () => {
    if (!publishedVersionId) return;
    setBusy(true);
    try {
      await createOffering({
        activityVersionId: publishedVersionId,
        kind: form.kind,
        modality: form.modality,
        scheduledDate: isEvent && form.scheduledDate ? form.scheduledDate : null,
        startTime: isEvent && form.startTime ? form.startTime : null,
        endTime: isEvent && form.endTime ? form.endTime : null,
        windowStart: isPermanent && form.windowStart ? form.windowStart : null,
        windowEnd: isPermanent && form.windowEnd ? form.windowEnd : null,
        intensityTheoryHours: form.intensityTheoryHours ? Number(form.intensityTheoryHours) : null,
        intensityPracticeHours: form.intensityPracticeHours ? Number(form.intensityPracticeHours) : null,
        instructorUserId: form.instructorUserId || null,
        instructorExternalName: form.instructorExternalName.trim() || null,
        executedBy: form.executedBy,
        executedByOther: form.executedBy === 'OTROS' ? form.executedByOther.trim() || null : null,
        location: form.location.trim() || null,
        regionalId: form.regionalId || null,
        capacity: form.capacity ? Number(form.capacity) : null,
        observations: form.observations.trim() || null,
      });
      setCreating(false);
      await load();
      showToast({
        kind: 'success',
        title: 'Convocatoria creada en borrador',
        description: 'Al publicarla se congelan sus proyectados.',
      });
    } catch {
      showToast({ kind: 'danger', title: 'No se pudo crear la convocatoria' });
    } finally {
      setBusy(false);
    }
  };

  if (!publishedVersionId) {
    return (
      <div className="card">
        <EmptyState
          icon={CalendarDays}
          title="Primero publica una version"
          description="No se puede programar una formacion cuyo contenido todavia puede cambiar. Termina el contenido, publicalo, y vuelve aqui."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink-900">Convocatorias</h2>
          <p className="mt-1 text-sm text-ink-500">Cada vez que esta formacion se dicta o se abre, es una convocatoria.</p>
        </div>
        {!creating ? (
          <Button onClick={() => setCreating(true)}>
            <CalendarPlus size={16} />
            Programar
          </Button>
        ) : null}
      </div>

      {creating ? (
        <section className="card p-6">
          <h3 className="font-display text-base font-semibold text-ink-900">Nueva convocatoria</h3>
          <div className="mt-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field htmlFor="s-kind" label="Tipo" required hint="Permanente: la persona la empieza cuando quiera.">
                <Select id="s-kind" value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as OfferingKind })}>
                  <option value="PERMANENT">Permanente (autoservicio)</option>
                  <option value="EVENT">Evento con fecha</option>
                  <option value="HYBRID">Hibrida (fecha + autoservicio)</option>
                </Select>
              </Field>
              <Field htmlFor="s-modality" label="Modalidad" required>
                <Select
                  id="s-modality"
                  value={form.modality}
                  onChange={(event) => setForm({ ...form, modality: event.target.value as Modality })}
                >
                  <option value="VIRTUAL">Virtual</option>
                  <option value="PRESENCIAL">Presencial</option>
                  <option value="HIBRIDA">Hibrida</option>
                </Select>
              </Field>
            </div>

            {isEvent ? (
              <div className="grid gap-4 sm:grid-cols-3">
                <Field htmlFor="s-date" label="Fecha programada">
                  <Input id="s-date" type="date" value={form.scheduledDate} onChange={(event) => setForm({ ...form, scheduledDate: event.target.value })} />
                </Field>
                <Field htmlFor="s-start" label="Hora inicio">
                  <Input id="s-start" type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} />
                </Field>
                <Field htmlFor="s-end" label="Hora fin">
                  <Input id="s-end" type="time" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} />
                </Field>
              </div>
            ) : null}

            {isPermanent ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field htmlFor="s-wstart" label="Disponible desde" hint="Vacio: disponible siempre.">
                  <Input id="s-wstart" type="date" value={form.windowStart} onChange={(event) => setForm({ ...form, windowStart: event.target.value })} />
                </Field>
                <Field htmlFor="s-wend" label="Disponible hasta">
                  <Input id="s-wend" type="date" value={form.windowEnd} onChange={(event) => setForm({ ...form, windowEnd: event.target.value })} />
                </Field>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                htmlFor="s-theory"
                label="Intensidad teorica (horas)"
                hint="Se exige desglosada: el PESV la pide asi y suma para las horas de BPM."
              >
                <Input
                  id="s-theory"
                  type="number"
                  min={0}
                  step="0.5"
                  value={form.intensityTheoryHours}
                  onChange={(event) => setForm({ ...form, intensityTheoryHours: event.target.value })}
                />
              </Field>
              <Field htmlFor="s-practice" label="Intensidad practica (horas)">
                <Input
                  id="s-practice"
                  type="number"
                  min={0}
                  step="0.5"
                  value={form.intensityPracticeHours}
                  onChange={(event) => setForm({ ...form, intensityPracticeHours: event.target.value })}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field htmlFor="s-instructor" label="Instructor o capacitador" hint="Quien dicta la formacion.">
                <Select
                  id="s-instructor"
                  value={form.instructorUserId}
                  onChange={(event) => setForm({ ...form, instructorUserId: event.target.value })}
                >
                  <option value="">Externo o sin definir</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.fullName} — {person.area?.name ?? "sin area"}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field htmlFor="s-external" label="Nombre del instructor externo" hint="Solo si no esta en la lista.">
                <Input
                  id="s-external"
                  disabled={Boolean(form.instructorUserId)}
                  value={form.instructorExternalName}
                  onChange={(event) => setForm({ ...form, instructorExternalName: event.target.value })}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field htmlFor="s-executed" label="Ejecutada por" required>
                <Select
                  id="s-executed"
                  value={form.executedBy}
                  onChange={(event) => setForm({ ...form, executedBy: event.target.value as ExecutedBy })}
                >
                  <option value="PROPIOS">Propios</option>
                  <option value="TEMPORALES">Temporales</option>
                  <option value="ARL">ARL</option>
                  <option value="EPS">EPS</option>
                  <option value="OTROS">Otros</option>
                </Select>
              </Field>
              {/* El campo libre aparece solo cuando hace falta: pedirlo siempre seria ruido. */}
              {form.executedBy === 'OTROS' ? (
                <Field htmlFor="s-executed-other" label="Cual" required>
                  <Input
                    id="s-executed-other"
                    value={form.executedByOther}
                    onChange={(event) => setForm({ ...form, executedByOther: event.target.value })}
                  />
                </Field>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field htmlFor="s-location" label="Lugar">
                <Input id="s-location" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} />
              </Field>
              <Field htmlFor="s-regional" label="Regional">
                <Select id="s-regional" value={form.regionalId} onChange={(event) => setForm({ ...form, regionalId: event.target.value })}>
                  <option value="">Todas</option>
                  {regionals.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field htmlFor="s-capacity" label="Cupo" hint="Vacio: sin limite.">
                <Input id="s-capacity" type="number" min={1} value={form.capacity} onChange={(event) => setForm({ ...form, capacity: event.target.value })} />
              </Field>
            </div>

            <Field htmlFor="s-observations" label="Observaciones">
              <Textarea
                id="s-observations"
                rows={2}
                value={form.observations}
                onChange={(event) => setForm({ ...form, observations: event.target.value })}
              />
            </Field>

            <p className="rounded-md bg-info-soft px-3 py-2 text-sm text-info">
              Los proyectados NO se escriben a mano: se derivan de a quienes va dirigida y se congelan al publicar.
            </p>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCreating(false)} disabled={busy}>
                Cancelar
              </Button>
              <Button onClick={() => void submit()} loading={busy}>
                Crear convocatoria
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      {!rows ? (
        <Skeleton className="h-48 w-full" />
      ) : rows.length === 0 && !creating ? (
        <div className="card">
          <EmptyState
            icon={CalendarDays}
            title="Sin programar"
            description="Nadie puede empezar esta formacion hasta que exista una convocatoria. Para autoservicio, crea una permanente."
            action={
              <Button onClick={() => setCreating(true)}>
                <CalendarPlus size={16} />
                Programar
              </Button>
            }
          />
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((offering) => (
            <li key={offering.id}>
              <Link href={`/convocatorias/${offering.id}`} className="focus-ring card card-hover flex items-center gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink-900">
                    {offering.code} · {kindLabel(offering.kind)}
                  </p>
                  <p className="mt-0.5 truncate text-sm text-ink-500">
                    {offering.scheduledDate ? formatDate(offering.scheduledDate) : 'Sin fecha, disponible en su ventana'}
                    {offering.regional ? ` · ${offering.regional.name}` : ''}
                    {offering.location ? ` · ${offering.location}` : ''}
                    {` · ${offering._count.enrollments} inscritos`}
                    {offering.projectedCount !== null ? ` de ${offering.projectedCount} proyectados` : ''}
                  </p>
                  {/*
                    Es EL sitio donde se nota: se acaba de publicar una version desde la pestana de
                    al lado y esta convocatoria sigue entregando la anterior.
                  */}
                  {isOutdatedVersion(offering.activityVersion) &&
                  offering.status !== 'COMPLETED' &&
                  offering.status !== 'CANCELLED' ? (
                    <p className="mt-1 text-xs font-medium text-warn">
                      Entrega la version {offering.activityVersion.versionNumber}. Hay una mas nueva: abrela para
                      actualizarla.
                    </p>
                  ) : null}
                </div>
                <StatusPill kind={offering.status === 'PUBLISHED' ? 'ok' : offering.status === 'DRAFT' ? 'neutral' : 'info'} label={statusLabel(offering.status)} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function kindLabel(kind: OfferingKind): string {
  return kind === 'EVENT' ? 'Evento con fecha' : kind === 'PERMANENT' ? 'Permanente' : 'Hibrida';
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    DRAFT: 'BORRADOR',
    PUBLISHED: 'PUBLICADA',
    IN_PROGRESS: 'EN CURSO',
    COMPLETED: 'COMPLETADA',
    CANCELLED: 'CANCELADA',
  };
  return map[status] ?? status;
}
