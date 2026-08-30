'use client';

import { Info, Save, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { listCatalog, listPickableUsers, type CatalogRow, type PickableUser } from '@/lib/admin-api';
import { updateActivity, type ActivityDetail, type Modality } from '@/lib/catalog-api';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MultiSelect } from '@/components/ui/multi-select';
import { Select } from '@/components/ui/select';
import { PersonPicker } from '@/components/ui/person-picker';
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
  const [people, setPeople] = useState<PickableUser[]>([]);
  /**
   * EL RESPONSABLE SE COMPORTA COMO EL CONTENIDO (Decision #64): se decide mientras hay un
   * borrador abierto y se congela al publicar. Sin borrador, el campo se ve pero no se toca, y el
   * texto dice la salida —crear una version nueva—, que es la operacion que hay que hacer y que
   * casi nadie sabe que existe. Deshabilitado y explicado, no escondido: quien entra a la ficha
   * tiene que poder VER quien responde.
   */
  const hayBorrador = activity.versions.some((version) => version.status === 'DRAFT');
  const [helpOpen, setHelpOpen] = useState(false);
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

    // `listUsers({ pageSize: 200 })` devolvia 422 SIEMPRE (el servidor topa en 100) y el catch
    // vacio lo escondia: el desplegable salia sin nadie dentro y parecia que no habia personas.
    void listPickableUsers().then(setPeople).catch(() => undefined);
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

  /**
   * Candidatos a responsable: la gente del AREA a la que pertenece el proceso elegido.
   *
   * Un desplegable con las 116 personas de la empresa obliga a saberse de memoria quien lleva
   * SARLAFT. Si el proceso todavia no cuelga de un area —o el area no tiene gente— se ofrecen
   * todas: es mejor una lista larga que una vacia, que es lo que parece un error.
   */
  const areaDelProceso = catalogs.processes.find((row) => row.id === form.processId)?.areaId ?? null;


  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-start">
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
                label="Responsable"
                hint={
                  hayBorrador
                    ? 'Se hereda del proceso al crear la formacion. Recibe los avisos de incumplimiento, y al publicar queda congelado en la version.'
                    : 'Congelado en la version publicada: es quien respondia cuando se dicto. Para cambiarlo, crea una version nueva.'
                }
              >
                <PersonPicker
                  id="i-responsible"
                  disabled={!canEdit || !hayBorrador}
                  people={people}
                  suggestedAreaId={areaDelProceso}
                  value={form.responsibleUserId || null}
                  onChange={(personId) => setForm({ ...form, responsibleUserId: personId ?? '' })}
                />
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
            {/*
              La norma vive AQUI y no en su propia tarjeta: es un campo mas de la ficha, y un
              contenedor entero para un solo desplegable hacia parecer que decidia algo. No decide:
              clasifica.
            */}
            <Field
              htmlFor="i-norms"
              label="Norma aplicable"
              hint="Solo clasifica, para poder decir despues cuanta formacion tributa a cada norma. No decide a quien se le exige."
            >
              <MultiSelect
                id="i-norms"
                disabled={!canEdit}
                placeholder="Ninguna norma seleccionada"
                options={catalogs.norms.map((row) => ({ id: row.id, label: row.name }))}
                value={form.normIds}
                onChange={(normIds) => setForm({ ...form, normIds })}
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

      {/*
        LA AYUDA, guardada detras de un boton.
        Explica algo que se entiende una vez y no hace falta volver a leer, asi que ocupar un
        tercio de la pantalla para siempre le cobra a todo el mundo lo que solo necesita quien
        llega nuevo. Se abre cuando se pide, y se queda abierta mientras dure la sesion.
      */}
      {!helpOpen ? (
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          aria-label="Donde quedo cada dato"
          title="Donde quedo cada dato"
          className="focus-ring h-fit rounded-full border border-line bg-surface p-2.5 text-ink-500 transition-colors duration-150 hover:border-info hover:text-info"
        >
          <Info size={18} strokeWidth={1.75} />
        </button>
      ) : (
      <aside className="card h-fit w-[320px] p-5">
        <div className="flex items-start gap-2">
          <Info size={16} className="mt-0.5 shrink-0 text-info" strokeWidth={1.75} />
          <h3 className="font-display text-sm font-semibold text-ink-900">Donde quedo cada dato</h3>
          <button
            type="button"
            onClick={() => setHelpOpen(false)}
            aria-label="Ocultar la ayuda"
            className="focus-ring ml-auto -mr-1 -mt-1 rounded p-1 text-ink-500 hover:text-ink-900"
          >
            <X size={15} strokeWidth={2} />
          </button>
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
      )}
    </div>
  );
}
