'use client';

import { Info, Save } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { listCatalog, listUsers, type CatalogRow, type UserRow } from '@/lib/admin-api';
import { updateActivity, type ActivityDetail, type Modality } from '@/lib/catalog-api';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MultiSelect } from '@/components/ui/multi-select';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';

/**
 * FICHA DE LA FORMACION: todo lo que describe QUE se aprende y A QUIEN va dirigido.
 *
 * Esta pantalla existe para responder una pregunta concreta del cliente: "antes llenaba UN
 * formulario por capacitacion; ahora que hay actividades, versiones y convocatorias, donde
 * quedaron mis campos". La respuesta es que se repartieron en dos sitios, y el reparto no es
 * capricho:
 *
 *   AQUI (la actividad, se llena UNA vez y se reutiliza por anos):
 *     proceso, responsable, tipo, nombre, descripcion, modalidad por defecto,
 *     norma aplicable, servicios, regionales y cargos a los que va dirigida.
 *
 *   EN PROGRAMACION (la convocatoria, cambia cada vez que se dicta):
 *     fecha, intensidad horaria, instructor, ejecutada por, lugar y observaciones.
 *
 * Poner la fecha aqui obligaria a duplicar la formacion entera cada vez que se repite, que es
 * justo el problema que tenia el Excel.
 */
export function ActivityInfoTab({
  activity,
  onSaved,
  canEdit,
}: {
  activity: ActivityDetail;
  onSaved: () => Promise<void>;
  canEdit: boolean;
}) {
  const { showToast } = useToast();
  const [catalogs, setCatalogs] = useState<{
    processes: CatalogRow[];
    types: CatalogRow[];
    norms: CatalogRow[];
    services: CatalogRow[];
    regionals: CatalogRow[];
    jobTitles: CatalogRow[];
  } | null>(null);
  const [people, setPeople] = useState<UserRow[]>([]);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    name: activity.name,
    description: activity.description ?? '',
    processId: activity.process.id,
    activityTypeId: activity.activityType.id,
    responsibleUserId: activity.responsibleUserId ?? '',
    modality: activity.modality,
    normIds: activity.norms.map((row) => row.id),
    serviceIds: activity.services.map((row) => row.id),
    regionalIds: activity.regionals.map((row) => row.id),
    jobTitleIds: activity.jobTitles.map((row) => row.id),
  });

  useEffect(() => {
    void Promise.all([
      listCatalog('processes'),
      listCatalog('activity-types'),
      listCatalog('norms'),
      listCatalog('services'),
      listCatalog('regionals'),
      listCatalog('job-titles'),
    ])
      .then(([processes, types, norms, services, regionals, jobTitles]) =>
        setCatalogs({ processes, types, norms, services, regionals, jobTitles }),
      )
      .catch(() => showToast({ kind: 'danger', title: 'No se pudieron cargar los catalogos' }));

    void listUsers({ active: 'true', pageSize: 200 })
      .then((page) => setPeople(page.items))
      .catch(() => undefined);
  }, [showToast]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await updateActivity(activity.id, {
        name: form.name.trim(),
        description: form.description.trim() || null,
        processId: form.processId,
        activityTypeId: form.activityTypeId,
        responsibleUserId: form.responsibleUserId || null,
        modality: form.modality,
        normIds: form.normIds,
        serviceIds: form.serviceIds,
        regionalIds: form.regionalIds,
        jobTitleIds: form.jobTitleIds,
      });
      await onSaved();
      showToast({ kind: 'success', title: 'Ficha guardada' });
    } catch {
      showToast({ kind: 'danger', title: 'No se pudo guardar la ficha' });
    } finally {
      setSaving(false);
    }
  }, [activity.id, form, onSaved, showToast]);

  if (!catalogs) return <Skeleton className="h-96 w-full" />;

  /** El cargo se lee mejor con su tipo al lado: "Conductor (Operativo)". */
  const jobTitleOptions = catalogs.jobTitles.map((row) => ({
    id: row.id,
    label: row.name,
    hint: row.jobTitleType?.name,
  }));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="space-y-6">
        <section className="card p-6">
          <h2 className="font-display text-lg font-semibold text-ink-900">Informacion basica</h2>
          <p className="mb-5 mt-1 text-sm text-ink-500">Que se aprende y de quien depende. Se llena una vez.</p>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field htmlFor="i-process" label="Proceso" required hint="El sistema de gestion que origina la formacion.">
                <Select
                  id="i-process"
                  disabled={!canEdit}
                  value={form.processId}
                  onChange={(event) => setForm({ ...form, processId: event.target.value })}
                >
                  {catalogs.processes.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.code} — {row.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                htmlFor="i-responsible"
                label="Responsable del proceso"
                hint="Normalmente el jefe del area. Recibe los avisos de incumplimiento."
              >
                <Select
                  id="i-responsible"
                  disabled={!canEdit}
                  value={form.responsibleUserId}
                  onChange={(event) => setForm({ ...form, responsibleUserId: event.target.value })}
                >
                  <option value="">Sin responsable asignado</option>
                  {people.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.fullName} — {person.area.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field htmlFor="i-type" label="Tipo de formacion" required>
                <Select
                  id="i-type"
                  disabled={!canEdit}
                  value={form.activityTypeId}
                  onChange={(event) => setForm({ ...form, activityTypeId: event.target.value })}
                >
                  {catalogs.types.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field htmlFor="i-modality" label="Modalidad" hint="Por defecto. Cada convocatoria puede precisarla.">
                <Select
                  id="i-modality"
                  disabled={!canEdit}
                  value={form.modality}
                  onChange={(event) => setForm({ ...form, modality: event.target.value as Modality })}
                >
                  <option value="VIRTUAL">Virtual</option>
                  <option value="PRESENCIAL">Presencial</option>
                  <option value="HIBRIDA">Hibrida</option>
                </Select>
              </Field>
            </div>

            <Field htmlFor="i-name" label="Nombre de la formacion" required>
              <Input
                id="i-name"
                disabled={!canEdit}
                value={form.name}
                maxLength={200}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </Field>

            <Field htmlFor="i-description" label="Descripcion" hint="Lo que vera el colaborador antes de empezar.">
              <Textarea
                id="i-description"
                rows={3}
                maxLength={4000}
                disabled={!canEdit}
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </Field>
          </div>
        </section>

        <section className="card p-6">
          <h2 className="font-display text-lg font-semibold text-ink-900">Alcance y dirigido a</h2>
          <p className="mb-5 mt-1 text-sm text-ink-500">
            A que norma tributa y a quienes aplica. De aqui salen los reportes por norma y la matriz de competencia.
          </p>

          <div className="space-y-4">
            <Field htmlFor="i-norms" label="Norma aplicable" hint="Una formacion puede tributar a varias.">
              <MultiSelect
                id="i-norms"
                disabled={!canEdit}
                placeholder="Ninguna norma seleccionada"
                options={catalogs.norms.map((row) => ({ id: row.id, label: row.name }))}
                value={form.normIds}
                onChange={(normIds) => setForm({ ...form, normIds })}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field htmlFor="i-services" label="Servicios">
                <MultiSelect
                  id="i-services"
                  disabled={!canEdit}
                  placeholder="Todos los servicios"
                  options={catalogs.services.map((row) => ({ id: row.id, label: row.name }))}
                  value={form.serviceIds}
                  onChange={(serviceIds) => setForm({ ...form, serviceIds })}
                />
              </Field>

              <Field htmlFor="i-regionals" label="Regionales">
                <MultiSelect
                  id="i-regionals"
                  disabled={!canEdit}
                  placeholder="Todas las regionales"
                  options={catalogs.regionals.map((row) => ({ id: row.id, label: row.name }))}
                  value={form.regionalIds}
                  onChange={(regionalIds) => setForm({ ...form, regionalIds })}
                />
              </Field>
            </div>

            <Field
              htmlFor="i-jobtitles"
              label="Dirigido a (cargos)"
              hint="Sugiere a quien conviene asignarla. La obligacion real se crea en la pestana Quienes."
            >
              <MultiSelect
                id="i-jobtitles"
                disabled={!canEdit}
                placeholder="Todos los cargos"
                options={jobTitleOptions}
                value={form.jobTitleIds}
                onChange={(jobTitleIds) => setForm({ ...form, jobTitleIds })}
              />
            </Field>
          </div>
        </section>

        {canEdit ? (
          <div className="flex justify-end">
            <Button onClick={() => void save()} loading={saving}>
              <Save size={16} />
              Guardar ficha
            </Button>
          </div>
        ) : null}
      </div>

      <aside className="card h-fit p-5">
        <div className="flex items-start gap-2">
          <Info size={16} className="mt-0.5 shrink-0 text-info" strokeWidth={1.75} />
          <h3 className="font-display text-sm font-semibold text-ink-900">Donde quedo cada dato</h3>
        </div>
        <p className="mt-2 text-sm text-ink-500">
          El formulario de una sola hoja se partio en dos, y la razon es que la mitad de los datos NO cambian
          cuando la formacion se vuelve a dictar.
        </p>
        <dl className="mt-4 space-y-3 text-sm">
          <div>
            <dt className="font-medium text-ink-900">Aqui, en la ficha</dt>
            <dd className="text-ink-500">
              Proceso, responsable, tipo, nombre, descripcion, modalidad, norma, servicios, regionales y cargos.
              Se escribe una vez y sirve para siempre.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-ink-900">En Programacion</dt>
            <dd className="text-ink-500">
              Fecha, intensidad horaria teorica y practica, instructor, ejecutada por, lugar, cupo y observaciones.
              Cambian en cada jornada.
            </dd>
          </div>
          <div>
            <dt className="font-medium text-ink-900">En Contenido</dt>
            <dd className="text-ink-500">Las lecciones, videos, documentos y la evaluacion.</dd>
          </div>
          <div>
            <dt className="font-medium text-ink-900">En Quienes</dt>
            <dd className="text-ink-500">A quienes se les exige de verdad, con su fecha limite.</dd>
          </div>
        </dl>
      </aside>
    </div>
  );
}
