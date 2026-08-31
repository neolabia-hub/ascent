'use client';

import { CalendarDays, CalendarPlus, Info, Pencil } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '@/lib/api';
import { listCatalog, listPickableUsers, type PickableUser } from '@/lib/admin-api';
import {
  createOffering,
  getOffering,
  isOutdatedVersion,
  listOfferings,
  publishOffering,
  updateOffering,
  type OfferingDetail,
  type OfferingKind,
  type OfferingListItem,
} from '@/lib/delivery-api';
import type { Modality } from '@/lib/catalog-api';
import type { ActivityTypeConfig } from '@/lib/activity-type';
import { formatDate } from '@/lib/format';
import {
  convocatoriaExistente,
  cuerpoDeConvocatoria,
  loQueFaltaEnLaConvocatoria,
  nuevaConvocatoria,
  OfferingForm,
  type OfferingFormCatalogs,
  type OfferingFormValue,
} from '@/components/modules/delivery/offering-form';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { useToast } from '@/components/ui/toast';

/**
 * CONVOCATORIAS de una formacion: cuando se dicta, donde, quien y a quienes atiende.
 *
 * El formulario vive en `offering-form.tsx` y es el MISMO que usan el modulo de Convocatorias y
 * el plan. Antes habia dos, y divergieron: el de aqui pedia instructor y el otro no, asi que
 * quien programaba desde el plan no podia ponerlo nunca —tampoco despues, porque no existia
 * pantalla de edicion—.
 *
 * Una formacion virtual de autoservicio tambien necesita convocatoria: es la PERMANENTE, sin
 * fecha, que habilita a la gente a empezarla por su cuenta. Sin ninguna, la formacion se ve con
 * candado y no se puede empezar.
 */
export function ActivityScheduleTab({
  activityId,
  publishedVersionId,
  draftVersionId,
  activityModality,
  typeConfig,
}: {
  activityId: string;
  publishedVersionId: string | null;
  /**
   * La version en BORRADOR, si la hay. Se programa sobre ella cuando todavia no hay ninguna
   * publicada (Decision #77): planear el ano en enero es reservar el sitio en el calendario,
   * y el contenido se termina despues.
   */
  draftVersionId: string | null;
  activityModality: Modality;
  typeConfig: ActivityTypeConfig;
}) {
  /**
   * Sobre que version se programa: la publicada si la hay, y si no, el borrador.
   *
   * Se prefiere la PUBLICADA a proposito: es la que la gente va a cursar. Programar sobre un
   * borrador teniendo una publicada dejaria la convocatoria sin poder abrirse hasta publicar la
   * siguiente version, que no es lo que nadie quiere decir al programar una jornada.
   */
  const versionId = publishedVersionId ?? draftVersionId;
  const sinPublicar = publishedVersionId === null;
  const { showToast } = useToast();
  const [rows, setRows] = useState<OfferingListItem[] | null>(null);
  const [people, setPeople] = useState<PickableUser[]>([]);
  const [catalogs, setCatalogs] = useState<OfferingFormCatalogs>({
    regionals: [],
    jobTitles: [],
    areas: [],
    services: [],
  });
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  /** La convocatoria que se esta corrigiendo. `null` = se esta creando una nueva. */
  const [editing, setEditing] = useState<OfferingDetail | null>(null);
  const [form, setForm] = useState<OfferingFormValue>(() => nuevaConvocatoria(typeConfig, activityModality));

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
    void Promise.all([
      listCatalog('regionals'),
      listCatalog('job-titles'),
      listCatalog('areas'),
      listCatalog('services'),
    ])
      .then(([regionals, jobTitles, areas, services]) =>
        setCatalogs({
          regionals: regionals.filter((row) => row.active),
          jobTitles: jobTitles.filter((row) => row.active),
          areas: areas.filter((row) => row.active),
          services: services.filter((row) => row.active),
        }),
      )
      .catch(() => undefined);
  }, [load]);

  const falta = loQueFaltaEnLaConvocatoria(form);

  const cerrarFormulario = () => {
    setCreating(false);
    setEditing(null);
    setForm(nuevaConvocatoria(typeConfig, activityModality));
  };

  /**
   * CORREGIR una convocatoria. No existia: el servidor tenia el `PATCH` y el cliente web la
   * funcion, pero ninguna pantalla la llamaba. Programar con el instructor equivocado obligaba a
   * CANCELAR la jornada y crear otra, lo que ademas deja el renglon del plan como cancelado.
   */
  const corregir = async (id: string) => {
    setBusy(true);
    try {
      const offering = await getOffering(id);
      setEditing(offering);
      setForm(convocatoriaExistente(offering));
      setCreating(true);
    } catch {
      showToast({ kind: 'danger', title: 'No se pudo abrir la convocatoria' });
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!versionId) return;
    setBusy(true);
    try {
      if (editing) {
        await updateOffering(editing.id, cuerpoDeConvocatoria(form));
        showToast({ kind: 'success', title: 'Convocatoria corregida' });
      } else {
        await createOffering(cuerpoDeConvocatoria(form, versionId));
        showToast({
          kind: 'success',
          title: 'Convocatoria creada en borrador',
          description: 'Al publicarla se congelan sus proyectados.',
        });
      }
      cerrarFormulario();
      await load();
    } catch (error) {
      showToast({
        kind: 'danger',
        title:
          error instanceof ApiError && error.code === 'OFFERING_NOT_EDITABLE'
            ? 'Una convocatoria publicada no se edita: cancelala y programa otra'
            : 'No se pudo guardar la convocatoria',
      });
    } finally {
      setBusy(false);
    }
  };

  /**
   * DEJARLA DISPONIBLE DE UN CLIC.
   *
   * Sin convocatoria no se puede ejecutar NADA: los obligados ven la formacion en sus pendientes
   * con un candado y "todavia no esta abierta". Para una induccion o una pildora —que son de
   * autoservicio y solo necesitan UNA convocatoria permanente que dura anos— rellenar el
   * formulario entero era ceremonia pura: no hay fecha, ni lugar, ni instructor, ni cupo que
   * decidir.
   *
   * Crea la convocatoria permanente y la PUBLICA en el mismo acto, porque una convocatoria en
   * borrador deja el candado exactamente igual y el usuario no tiene forma de saberlo.
   */
  const abrirParaTodos = async () => {
    if (!versionId) return;
    setBusy(true);
    try {
      const offering = await createOffering({
        activityVersionId: versionId,
        kind: 'PERMANENT',
        modality: activityModality,
        executedBy: 'PROPIOS',
      });
      const result = await publishOffering(offering.id, {});
      await load();
      showToast({
        kind: 'success',
        title: result.executed ? 'Ya esta disponible' : 'Solicitud enviada a aprobacion',
        description: result.executed
          ? 'Quien la tenga exigida puede empezarla cuando quiera.'
          : 'Un administrador debe aprobarla antes de que se abra.',
      });
    } catch {
      showToast({ kind: 'danger', title: 'No se pudo dejar disponible' });
    } finally {
      setBusy(false);
    }
  };

  /**
   * Antes esto era un muro: "primero publica una version". Y sobraba, porque la compuerta de
   * verdad esta al PUBLICAR la convocatoria —ahi es donde se cita a la gente y se congelan los
   * proyectados—, no al crearla. Obligaba a publicar contenido vacio para poder planear el ano.
   */
  if (!versionId) {
    return (
      <div className="card">
        <EmptyState
          icon={CalendarDays}
          title="Esta formacion todavia no tiene contenido"
          description="Agrega su contenido en la pestana Contenido y vuelve aqui para programarla."
        />
      </div>
    );
  }

  /**
   * Una formacion sin convocatoria PUBLICADA no la puede hacer nadie. Los borradores no cuentan:
   * dejan el candado igual.
   */
  const sinAbrir = rows !== null && !rows.some((row) => row.status === 'PUBLISHED' || row.status === 'IN_PROGRESS');
  const esPermanente = typeConfig.defaultOfferingKind === 'PERMANENT';

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

      {/*
        SE PUEDE PROGRAMAR SIN PUBLICAR, y hay que decir hasta donde llega eso (Decision #77).
        Reservar el sitio en el calendario mientras se arma el contenido es lo normal al planear un
        ano; lo que no se puede es ABRIRLA a la gente. Sin esta linea, alguien programa, se va, y
        descubre el limite al pulsar publicar.
      */}
      {sinPublicar ? (
        <p className="flex items-start gap-2 rounded-lg border border-line-strong bg-paper px-4 py-3 text-sm text-ink-700">
          <Info size={15} className="mt-0.5 shrink-0 text-ink-500" strokeWidth={2} />
          <span>
            El contenido todavia esta en borrador. Puedes dejar la convocatoria <strong>programada</strong> —queda
            apartada en el calendario y entra al plan— pero no se podra <strong>publicar</strong> hasta que publiques
            el contenido: nadie puede cursar algo que aun puede cambiar.
          </span>
        </p>
      ) : null}

      {/*
        LA TRAMPA DEL CANDADO, dicha donde se resuelve.

        Publicar el contenido NO abre la formacion: sin convocatoria publicada, quien la tiene
        exigida la ve con candado y no puede empezarla. Es el estado roto mas facil de alcanzar
        —publicar y marcharse— y no habia nada en pantalla que lo dijera.
      */}
      {sinAbrir ? (
        <section className="card border-warn bg-warn-soft p-5">
          <h3 className="font-display text-base font-semibold text-warn">Todavia nadie puede hacerla</h3>
          <p className="mt-1 text-sm text-ink-700">
            El contenido esta publicado, pero sin convocatoria nadie puede empezarla: a quien la tenga
            exigida le sale con candado.
            {esPermanente
              ? ' Esta formacion es de autoservicio, asi que solo necesita quedar disponible.'
              : ' Programa la jornada con su fecha, lugar e instructor.'}
          </p>
          {esPermanente ? (
            <Button className="mt-4" onClick={() => void abrirParaTodos()} loading={busy}>
              <CalendarPlus size={16} />
              Dejarla disponible
            </Button>
          ) : null}
        </section>
      ) : null}

      {creating ? (
        <section className="card p-6">
          <h3 className="font-display text-base font-semibold text-ink-900">
            {editing ? `Corregir ${editing.code}` : 'Nueva convocatoria'}
          </h3>
          <p className="mb-5 mt-1 text-sm text-ink-500">
            {editing
              ? 'Se corrige mientras esta en borrador. Publicada, solo se ajusta la logistica.'
              : 'Queda en borrador. Al publicarla se congelan sus proyectados y se puede convocar gente.'}
          </p>

          <OfferingForm
            value={form}
            onChange={setForm}
            catalogs={catalogs}
            people={people}
            suggestedAreaId={null}
            soloLogistica={editing !== null && editing.status !== 'DRAFT'}
          />

          {falta.length > 0 ? (
            <ul className="mt-4 space-y-1 rounded-md bg-warn-soft px-3 py-2">
              {falta.map((linea) => (
                <li key={linea} className="text-sm text-warn">
                  {linea}
                </li>
              ))}
            </ul>
          ) : null}

          <p className="mt-4 rounded-md bg-info-soft px-3 py-2 text-sm text-info">
            Los proyectados NO se escriben a mano: se derivan de a quienes atiende y se congelan al publicar.
          </p>

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={cerrarFormulario} disabled={busy}>
              Cancelar
            </Button>
            <Button onClick={() => void submit()} loading={busy} disabled={falta.length > 0}>
              {editing ? 'Guardar cambios' : 'Crear convocatoria'}
            </Button>
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
            <li key={offering.id} className="flex items-stretch gap-2">
              <Link href={`/convocatorias/${offering.id}`} className="focus-ring card card-hover flex flex-1 items-center gap-4 p-4">
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
                <StatusPill
                  kind={offering.status === 'PUBLISHED' ? 'ok' : offering.status === 'DRAFT' ? 'neutral' : 'info'}
                  label={statusLabel(offering.status)}
                />
              </Link>
              {/*
                CORREGIR, que hasta hoy no existia en ninguna pantalla: el `PATCH` estaba en el
                servidor y en el cliente web, sin un solo uso. Equivocarse de instructor obligaba
                a CANCELAR la jornada y crear otra —y eso deja el renglon del plan cancelado—.
              */}
              {offering.status === 'DRAFT' ? (
                <Button
                  variant="outline"
                  className="shrink-0"
                  onClick={() => void corregir(offering.id)}
                  disabled={busy}
                  aria-label={`Corregir ${offering.code}`}
                >
                  <Pencil size={15} />
                  Corregir
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
/** El rotulo dice COMO entra la gente. Nunca "autoservicio" a secas: suena a opcional y no lo es. */
function kindLabel(kind: OfferingKind): string {
  if (kind === 'EVENT') return 'Sesion con fecha';
  return kind === 'PERMANENT' ? 'Disponible: la hace cuando pueda' : 'Sesion + disponible';
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
