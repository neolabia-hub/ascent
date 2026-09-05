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
  listPlans,
  addPlanItem,
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
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
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

  /*
    PROGRAMAR AQUI ENTRA AL PLAN, TAMBIEN CON EL PLAN APROBADO (2026-09-04).

    La Decision #75 ya metia la jornada en el plan del ano al programarla... pero solo si ese plan
    estaba en BORRADOR. Con el plan aprobado la jornada quedaba fuera: se dicta, la gente asiste, y
    no cuenta para el cumplimiento de nadie. Eso obligaba a tener un SEGUNDO boton en la ficha —el
    de la tarjeta del plan— que si sabia pedir el motivo, y a que el usuario adivinara cual usar.

    Ahora hay un solo camino. Con el plan vivo se pide la novedad aqui mismo, que es lo que exige la
    Decision #55, y el renglon entra por la misma via.
  */
  const [planDelAno, setPlanDelAno] = useState<{ id: string; year: number; status: string } | null>(null);
  const [motivoDelPlan, setMotivoDelPlan] = useState('');
  /** VIVO = ya aprobado. Es el unico caso en que el renglon no entra solo y hay que dar un motivo. */
  const planVivo = planDelAno && planDelAno.status !== 'DRAFT' ? planDelAno : null;

  useEffect(() => {
    if (!typeConfig.participatesInPlan) return;
    void listPlans()
      .then((filas) => {
        const enCurso = new Date().getFullYear();
        const abiertos = filas.filter((row) => row.status !== 'CLOSED');
        const elegido =
          abiertos.find((row) => row.year === enCurso) ??
          abiertos.filter((row) => row.year > enCurso).sort((a, b) => a.year - b.year)[0] ??
          null;
        setPlanDelAno(elegido ? { id: elegido.id, year: elegido.year, status: elegido.status } : null);
      })
      .catch(() => setPlanDelAno(null));
  }, [typeConfig.participatesInPlan]);

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
        const creada = await createOffering(cuerpoDeConvocatoria(form, versionId));
        /*
          CON EL PLAN VIVO, el servidor no mete el renglon solo (Decision #55: hay que decir por
          que). Se hace aqui, con el motivo que se acaba de pedir, para que programar signifique lo
          mismo con el plan en borrador y con el plan aprobado.

          El mes sale de la fecha de la jornada, igual que lo deduce el servidor cuando entra sola.
        */
        let entroAlPlan = false;
        if (planVivo && form.scheduledDate) {
          await addPlanItem(planVivo.id, {
            offeringId: creada.id,
            plannedMonth: Number(form.scheduledDate.slice(5, 7)),
            justification: motivoDelPlan.trim(),
          });
          entroAlPlan = true;
        }
        showToast({
          kind: 'success',
          title: entroAlPlan ? `Convocatoria creada y agregada al plan ${planVivo?.year}` : 'Convocatoria creada en borrador',
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
  /*
    "TODAVIA NADIE PUEDE HACERLA" SOLO APLICA SI EL CONTENIDO YA ESTA PUBLICADO (2026-09-03).

    Le faltaba esa mitad: con el contenido en borrador salian los DOS avisos a la vez, y el segundo
    decia "el contenido esta publicado" justo debajo del que decia que no lo estaba. Dos frases que
    se contradicen en la misma pantalla, y una de las dos mintiendo.

    Con el contenido en borrador no falta la convocatoria: falta publicar. Eso ya lo dice el aviso
    de arriba.
  */
  const sinAbrir =
    !sinPublicar && rows !== null && !rows.some((row) => row.status === 'PUBLISHED' || row.status === 'IN_PROGRESS');
  /*
    Y CUAL DE LOS TRES CASOS ES (2026-09-04).

    "Sin convocatoria nadie puede empezarla · programa la jornada" se ensenaba igual en los tres, y
    en dos de ellos es falso: la convocatoria existe. Lo reporto el cliente viendola en borrador.

      ninguna    -> falta programarla, que es lo que decia
      BORRADOR   -> ya esta programada; lo que falta es PUBLICARLA
      CANCELADA  -> la que habia se cancelo; hace falta otra

    Mandar a "programar" a quien ya programo es mandarlo a crear una segunda convocatoria para el
    mismo contenido, que es justo el estado que deja `409 OFFERING_NOT_OPEN` (ver RUNBOOK).
  */
  const enBorrador = (rows ?? []).filter((row) => row.status === 'DRAFT');
  const soloCanceladas = (rows ?? []).length > 0 && (rows ?? []).every((row) => row.status === 'CANCELLED');
  const esPermanente = typeConfig.defaultOfferingKind === 'PERMANENT';

  /*
    Y EN UNA CAPACITACION DEL PLAN FALTA UN PASO MAS (2026-09-04).

    Publicar la convocatoria no basta: las obligaciones de una capacitacion del plan nacen al
    APROBAR EL PLAN (Decision #76). Antes de eso nadie esta obligado, nadie la ve en sus pendientes
    y no hay a quien convocar — la formacion existe, la jornada existe, y no le llega a nadie.

    Es un estado que el aviso de arriba no cubria, porque ahi la convocatoria SI esta publicada:
    todo se ve correcto y no pasa nada. Lo pregunto el cliente con estas palabras: "programar le
    sale al aprendiz pero no hasta que este aprobado".
  */
  const hayPublicada = (rows ?? []).some((row) => row.status === 'PUBLISHED' || row.status === 'IN_PROGRESS');
  const faltaAprobarElPlan =
    typeConfig.participatesInPlan && !sinPublicar && hayPublicada && planDelAno !== null && planDelAno.status === 'DRAFT';

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
            apartada en el calendario— pero no se podra <strong>publicar</strong> hasta que publiques el contenido:
            nadie puede cursar algo que aun puede cambiar.
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
            El contenido esta publicado, pero a quien la tenga exigida le sale con{' '}
            <strong>candado</strong>.{' '}
            {enBorrador.length > 0 ? (
              <>
                La convocatoria <strong>{enBorrador[0]?.code}</strong> esta en borrador: ya esta programada, lo que
                falta es <strong>publicarla</strong>. Abrela abajo y publicala — no hace falta crear otra.
              </>
            ) : soloCanceladas ? (
              <>
                La convocatoria que habia se <strong>cancelo</strong>, asi que hace falta{' '}
                {esPermanente ? 'volver a dejarla disponible' : 'programar otra jornada'}.
              </>
            ) : esPermanente ? (
              'Esta formacion es de autoservicio, asi que solo necesita quedar disponible.'
            ) : (
              'Programa la jornada con su fecha, lugar e instructor.'
            )}
            {/*
              Y en una del plan, publicar la convocatoria TAMPOCO basta. Se dice aqui para que no
              se descubra despues, cuando ya se dio todo por hecho.
            */}
            {typeConfig.participatesInPlan && planDelAno?.status === 'DRAFT' ? (
              <>
                {' '}
                Y despues hay que <strong>aprobar el plan de {planDelAno.year}</strong>: las obligaciones de una
                capacitacion del plan nacen ahi, no al publicar.
              </>
            ) : null}
          </p>
          {/* Con una en borrador el atajo seria un error: crearia una SEGUNDA para lo mismo. */}
          {esPermanente && enBorrador.length === 0 ? (
            <Button className="mt-4" onClick={() => void abrirParaTodos()} loading={busy}>
              <CalendarPlus size={16} />
              Dejarla disponible
            </Button>
          ) : null}
          {enBorrador.length > 0 ? (
            <Link
              href={`/convocatorias/${enBorrador[0]?.id}?desde=formacion`}
              className="focus-ring mt-4 inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-medium text-white"
              style={{ backgroundColor: 'var(--brand-primary)' }}
            >
              <CalendarPlus size={16} />
              Abrir {enBorrador[0]?.code} para publicarla
            </Link>
          ) : null}
        </section>
      ) : null}

      {/*
        EL ESTADO QUE NO CUBRIA NINGUN AVISO: todo publicado y el plan sin aprobar.

        Aqui `sinAbrir` es falso —la convocatoria ESTA publicada— asi que la pantalla no decia nada,
        y sin embargo no le llega a nadie: las obligaciones de una capacitacion del plan nacen al
        aprobar el plan. Todo se ve bien y no pasa nada, que es la peor forma de estar roto.
      */}
      {faltaAprobarElPlan && planDelAno ? (
        <section className="card border-warn bg-warn-soft p-5">
          <h3 className="font-display text-base font-semibold text-warn">Falta aprobar el plan</h3>
          <p className="mt-1 text-sm text-ink-700">
            La jornada esta publicada, pero <strong>todavia no le llega a nadie</strong>: las obligaciones de una
            capacitacion del plan nacen al <strong>aprobar el plan de {planDelAno.year}</strong>. Hasta entonces nadie
            la tiene en sus pendientes y no hay a quien convocar.
          </p>
          <Link
            href={`/plan/${planDelAno.id}`}
            className="focus-ring mt-4 inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-medium text-white"
            style={{ backgroundColor: 'var(--brand-primary)' }}
          >
            <CalendarPlus size={16} />
            Abrir el plan de {planDelAno.year}
          </Link>
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
            activityVersionId={versionId}
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

          {/*
            LA NOVEDAD DEL PLAN, aqui y no en otra pantalla. Solo al CREAR y solo con el plan vivo:
            en borrador el renglon entra solo y pedir un motivo por cada jornada del ano seria ruido.
          */}
          {planVivo && !editing ? (
            <div className="mt-4">
              <Field
                htmlFor="prog-motivo"
                label={`Por que entra al plan ${planVivo.year}`}
                required
                hint="El plan ya esta aprobado: una jornada nueva obliga a gente real y queda en el registro."
              >
                <Textarea
                  id="prog-motivo"
                  rows={2}
                  maxLength={500}
                  value={motivoDelPlan}
                  onChange={(event) => setMotivoDelPlan(event.target.value)}
                  placeholder="Minimo 10 caracteres"
                />
              </Field>
            </div>
          ) : null}

          <p className="mt-4 rounded-md bg-info-soft px-3 py-2 text-sm text-info">
            Los proyectados NO se escriben a mano: se derivan de a quienes atiende y se congelan al publicar.
            {planVivo && !editing ? ` Al crearla entra en el plan ${planVivo.year}.` : ''}
          </p>

          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={cerrarFormulario} disabled={busy}>
              Cancelar
            </Button>
            <Button
              onClick={() => void submit()}
              loading={busy}
              disabled={falta.length > 0 || (planVivo !== null && !editing && motivoDelPlan.trim().length < 10)}
            >
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
              <Link href={`/convocatorias/${offering.id}?desde=formacion`} className="focus-ring card card-hover flex flex-1 items-center gap-4 p-4">
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
