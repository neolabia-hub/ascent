'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowUpCircle, CheckCircle2, Send, SlidersHorizontal, UserPlus, Users, XCircle } from 'lucide-react';
import { ApiError } from '@/lib/api';
import {
  adjustProjected,
  cancelOffering,
  completeOffering,
  enrollOffering,
  getPendingInvites,
  type PendingInvites,
  getOffering,
  getRoster,
  migrateOfferingVersion,
  publishOffering,
  type MigrationPolicyCode,
  type OfferingDetail,
  type OfferingStatus,
  type RosterRow,
} from '@/lib/delivery-api';
import { formatDate } from '@/lib/format';
import { ListaDeAsistencia } from '@/components/modules/delivery/lista-de-asistencia';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill, type StatusPillKind } from '@/components/ui/status-pill';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';

const STATUS_LABEL: Record<OfferingStatus, { kind: StatusPillKind; label: string }> = {
  DRAFT: { kind: 'neutral', label: 'BORRADOR' },
  PUBLISHED: { kind: 'info', label: 'PUBLICADA' },
  IN_PROGRESS: { kind: 'warn', label: 'EN CURSO' },
  COMPLETED: { kind: 'ok', label: 'EJECUTADA' },
  CANCELLED: { kind: 'danger', label: 'CANCELADA' },
};

/**
 * QUE LE PASA A LA GENTE al apuntar la convocatoria a la version nueva. La politica se eligio al
 * PUBLICAR esa version y aqui solo se explica: quien autoriza tiene que leer la consecuencia en
 * castellano, no el nombre de un enum.
 */
const MIGRATION_EFFECT: Record<MigrationPolicyCode, string> = {
  FINISH_OLD:
    'Quien ya estaba inscrito TERMINA en la version anterior. La version nueva la veran solo quienes se inscriban de aqui en adelante.',
  MOVE_NOT_STARTED:
    'Pasan a la version nueva quienes todavia no han abierto nada. Quien ya empezo termina en la anterior, para no quitarle el avance.',
  RESTART_NEW:
    'Todos los que no han cerrado pasan a la version nueva y vuelven a empezar. Lo ya completado no se toca.',
};

function Stat({
  label,
  value,
  hint,
  accion,
}: {
  label: string;
  value: string | number;
  hint?: string;
  /** Accion pequena en la esquina, para el numero que se puede corregir. */
  accion?: React.ReactNode;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-[0.04em] text-ink-500">{label}</p>
        {accion}
      </div>
      <p className="mt-1 font-display text-[28px] font-bold tabular-nums text-ink-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink-500">{hint}</p> : null}
    </div>
  );
}

export default function ConvocatoriaDetallePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  const [offering, setOffering] = useState<OfferingDetail | null>(null);
  /*
    AJUSTAR LOS PROYECTADOS ES OTRA COSA QUE PUBLICAR (2026-09-04).

    Vivia DENTRO del cajon de publicar, y ahi no tiene sentido: el numero acaba de derivarse de los
    obligados de hoy y no ha tenido tiempo de quedarse viejo. Ofrecer corregirlo en ese momento
    invita a teclear un numero sobre un dato que todavia es exacto — y el motivo, que es la
    evidencia que lee el auditor, acaba diciendo "ajuste inicial".

    La Regla de oro 3 sigue igual: el numero se DERIVA y se congela, y corregirlo exige motivo. Lo
    que cambia es CUANDO se ofrece: despues, sobre la cifra ya congelada, que es cuando la realidad
    se ha movido —"ingresaron 7 conductores despues de congelar"— y el motivo dice algo.
  */
  const [ajusteOpen, setAjusteOpen] = useState(false);
  const [ajusteCount, setAjusteCount] = useState('');
  const [ajusteReason, setAjusteReason] = useState('');
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [busy, setBusy] = useState(false);

  const [publishOpen, setPublishOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [migrateOpen, setMigrateOpen] = useState(false);
  const [migrateReason, setMigrateReason] = useState('');

  /** Quien falta por convocar. Se pide junto con lo demas: es parte de la foto, no un extra. */
  const [pendientes, setPendientes] = useState<PendingInvites | null>(null);

  const load = useCallback(async () => {
    try {
      const [detail, rosterResult, pendingResult] = await Promise.all([
        getOffering(id),
        getRoster(id),
        getPendingInvites(id).catch(() => null),
      ]);
      setOffering(detail);
      setRoster(rosterResult.items);
      setPendientes(pendingResult);
    } catch {
      showToast({ kind: 'danger', title: 'No se pudo cargar la convocatoria' });
    }
  }, [id, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const ajustar = async () => {
    const cantidad = Number(ajusteCount);
    if (!Number.isInteger(cantidad) || cantidad < 0 || ajusteReason.trim().length < 10) return;
    setBusy(true);
    try {
      const result = await adjustProjected(id, { projectedCount: cantidad, reason: ajusteReason.trim() });
      showToast(
        result.executed
          ? { kind: 'success', title: 'Proyectados ajustados', description: 'El motivo queda en la auditoria.' }
          : { kind: 'info', title: 'Enviado a aprobacion', description: 'Un administrador debe autorizar el ajuste.' },
      );
      setAjusteOpen(false);
      setAjusteCount('');
      setAjusteReason('');
      await load();
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo ajustar', description: error instanceof ApiError ? error.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    setBusy(true);
    try {
      // Publicar ya no lleva ajuste: congela lo derivado y punto. Corregirlo es otra decision, con
      // su propio cajon (ver la nota de `ajusteOpen`). La API sigue admitiendo el override para no
      // romper a quien lo llame, pero la pantalla no lo manda.
      const result = await publishOffering(id, {});
      showToast(
        result.executed
          ? { kind: 'success', title: 'Convocatoria publicada', description: 'Los proyectados quedaron congelados.' }
          : { kind: 'info', title: 'Enviada a aprobacion', description: 'Un administrador debe autorizar la publicacion.' },
      );
      setPublishOpen(false);
      await load();
    } catch {
      showToast({ kind: 'danger', title: 'No se pudo publicar' });
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    setBusy(true);
    try {
      const result = await cancelOffering(id, cancelReason);
      showToast(
        result.executed
          ? { kind: 'success', title: 'Convocatoria cancelada' }
          : { kind: 'info', title: 'Enviada a aprobacion', description: 'Un administrador debe autorizar la cancelacion.' },
      );
      setCancelOpen(false);
      setCancelReason('');
      await load();
    } catch {
      showToast({ kind: 'danger', title: 'No se pudo cancelar' });
    } finally {
      setBusy(false);
    }
  };


  /** Convocar a UNA persona. El reparto no siempre es "todos": a veces se cita de a uno. */
  const convocarA = async (userId: string) => {
    setBusy(true);
    try {
      const result = await enrollOffering(id, { userIds: [userId] });
      showToast({
        kind: result.enrolled > 0 ? 'success' : 'info',
        title: result.enrolled > 0 ? 'Convocada' : 'Ya estaba convocada',
      });
      await load();
    } catch (error) {
      showToast({
        kind: 'danger',
        title:
          error instanceof ApiError && error.code === 'OFFERING_CAPACITY_EXCEEDED'
            ? 'Se supera el cupo'
            : 'No se pudo convocar',
      });
    } finally {
      setBusy(false);
    }
  };

  const enrollObliged = async () => {
    setBusy(true);
    try {
      const result = await enrollOffering(id, { allAssigned: true });
      /*
        CUANDO NO CABEN TODOS, EL AVISO TIENE QUE SER ACCIONABLE (2026-09-04).

        Antes el servidor fallaba entero y esto solo decia "Se supera el cupo". Ahora convoca a los
        que caben —primero quien vence antes— y aqui se dice cuantos quedaron fuera y que hacer,
        que es lo unico que le sirve a quien esta programando: partir en dos jornadas.
      */
      const restos = [
        result.skipped > 0 ? `${result.skipped} ya estaban inscritas` : null,
        result.sinCupo > 0 ? `faltan ${result.sinCupo} por cupo: programa otra jornada` : null,
      ].filter(Boolean).join(' · ');
      showToast({
        kind: result.sinCupo > 0 ? 'warning' : result.enrolled > 0 ? 'success' : 'info',
        title:
          result.sinCupo > 0
            ? `${result.enrolled} inscritas de ${result.enrolled + result.sinCupo} obligadas`
            : result.enrolled > 0
              ? `${result.enrolled} personas inscritas`
              : 'No habia obligados sin inscribir',
        description: restos || undefined,
      });
      await load();
    } catch (error) {
      showToast({
        kind: 'danger',
        title: error instanceof ApiError && error.code === 'OFFERING_CAPACITY_EXCEEDED' ? 'Se supera el cupo' : 'No se pudo inscribir',
      });
    } finally {
      setBusy(false);
    }
  };

  const migrate = async () => {
    const target = offering?.versionUpgrade.target;
    if (!target) return;
    setBusy(true);
    try {
      const result = await migrateOfferingVersion(id, target.id, migrateReason.trim() || undefined);
      showToast(
        result.executed
          ? {
              kind: 'success',
              title: `Convocatoria actualizada a la version ${target.versionNumber}`,
              description: 'Se aplico la politica de migracion que se eligio al publicarla.',
            }
          : { kind: 'info', title: 'Enviada a aprobacion', description: 'Un administrador debe autorizar el cambio.' },
      );
      setMigrateOpen(false);
      setMigrateReason('');
      await load();
    } catch (error) {
      // Publicaron otra version mientras esta pantalla estaba abierta: se recarga en vez de mover
      // a la gente a algo que nadie reviso.
      const superseded = error instanceof ApiError && error.code === 'VERSION_SUPERSEDED';
      showToast({
        kind: 'danger',
        title: superseded ? 'Se publico otra version mientras decidias' : 'No se pudo actualizar',
        description: superseded ? 'Revisa la nueva antes de mover a los inscritos.' : undefined,
      });
      if (superseded) await load();
    } finally {
      setBusy(false);
    }
  };

  const complete = async () => {
    setBusy(true);
    try {
      await completeOffering(id);
      showToast({ kind: 'success', title: 'Convocatoria cerrada', description: 'Cuenta como ejecutada en el plan anual.' });
      await load();
    } catch {
      showToast({ kind: 'danger', title: 'No se pudo cerrar' });
    } finally {
      setBusy(false);
    }
  };

  if (!offering) return <Skeleton className="h-96 w-full" />;

  const activity = offering.activityVersion.activity;
  const state = STATUS_LABEL[offering.status];
  const isDraft = offering.status === 'DRAFT';
  const isOpen = offering.status === 'PUBLISHED' || offering.status === 'IN_PROGRESS';
  /**
   * AUTOSERVICIO: la persona entra sola. Aqui "convocar" no significa nada —nadie cita a nadie— y
   * ensenar "faltan por convocar" invita a inscribir a mano a gente que iba a entrar sola, lo que
   * ademas cuenta como inscrita antes de que haya hecho nada.
   */
  /** Por que puerta se entro: la lista de Convocatorias, o la ficha de la formacion. */
  const desdeLaFormacion = searchParams.get('desde') === 'formacion';
  const esAutoservicio = offering.kind !== 'EVENT';
  /** Solo la capacitacion del plan participa del programa anual (Decision #78). */
  const entraAlPlan = offering.activityVersion.activity.activityType.config?.participatesInPlan === true;
  const upgrade = offering.versionUpgrade;

  return (
    <div>
      {/*
        ATRAS VUELVE A DONDE ESTABAS (2026-09-04).

        A esta pantalla se llega por dos puertas: la lista de Convocatorias y la pestana
        "Programacion" de la ficha de una formacion. El enlace de volver decia siempre
        "Convocatorias", asi que quien venia de la ficha acababa en una lista de doscientas jornadas
        buscando por donde entro. Lo noto el cliente.

        La puerta de entrada viaja en `?desde=formacion`. Se prefiere eso al historial del
        navegador —`router.back()`— porque el historial miente en cuanto alguien recarga la pagina,
        abre el enlace en otra pestana o llega desde un correo.
      */}
      <Link
        href={desdeLaFormacion ? `/contenido-formativo/${offering.activityVersion.activity.id}?tab=programacion` : '/convocatorias'}
        className="focus-ring mb-4 inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900"
      >
        <ArrowLeft size={15} />
        {desdeLaFormacion ? offering.activityVersion.activity.name : 'Convocatorias'}
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-[28px] font-semibold text-ink-900">{activity.name}</h1>
            {/*
              QUE TIPO DE FORMACION ES, aqui y con su color.
              La cabecera decia el nombre, el codigo, la version y el proceso, pero no el TIPO — y
              el tipo es lo que decide si esto cuenta para el plan, si se repite y si emite
              constancia. Sin el, dos convocatorias que se leen igual pueden significar cosas
              distintas, y hay que salirse a la ficha para saber cual es cual.
            */}
            <span
              className="rounded-full px-2 py-0.5 text-xs font-medium"
              style={{
                backgroundColor: `color-mix(in srgb, ${activity.activityType.colorHex ?? '#5b6572'} 12%, white)`,
                color: activity.activityType.colorHex ?? 'var(--ink-700)',
              }}
            >
              {activity.activityType.name}
            </span>
            <StatusPill kind={state.kind} label={state.label} />
          </div>
          <p className="mt-1 text-sm text-ink-500">
            <span className="font-mono">{offering.code}</span> · version {offering.activityVersion.versionNumber} ·{' '}
            {activity.process.name}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isDraft ? (
            <Button onClick={() => setPublishOpen(true)} loading={busy}>
              <Send size={16} />
              Publicar
            </Button>
          ) : null}
          {/*
            CONVOCAR solo aparece cuando hay a quien convocar y donde significa algo.

            En AUTOSERVICIO no significa nada: la persona entra sola, y citarla a mano la cuenta
            como inscrita antes de que haya hecho nada. Y cuando no falta nadie, el boton seguia
            ahi cambiando de texto a "Convocar a los obligados" para responder "no habia obligados
            sin inscribir": un boton que solo sabe decir que no hacia falta pulsarlo.
          */}
          {isOpen && !esAutoservicio && pendientes && pendientes.faltan.length > 0 ? (
            <Button variant="ghost" onClick={enrollObliged} loading={busy}>
              <UserPlus size={16} />
              Convocar a los {pendientes.faltan.length} que faltan
            </Button>
          ) : null}
          {isOpen ? (
            <Button onClick={complete} loading={busy}>
              <CheckCircle2 size={16} />
              Cerrar convocatoria
            </Button>
          ) : null}
          {offering.status !== 'CANCELLED' && offering.status !== 'COMPLETED' ? (
            <Button variant="ghost" onClick={() => setCancelOpen(true)}>
              <XCircle size={16} />
              Cancelar
            </Button>
          ) : null}
        </div>
      </div>

      {/*
        LA VERSION NUEVA NO SE APLICA SOLA. Publicar la v2 de una formacion dejaba esta
        convocatoria colgada de la v1 sin decirlo en ninguna parte: el administrador creia haber
        actualizado el contenido y el aprendiz seguia viendo el anterior. Se avisa aqui, con la
        consecuencia escrita, y se actualiza a proposito.
      */}
      {upgrade.available && upgrade.target ? (
        <div className="mb-6 rounded-lg border border-warn/30 bg-warn-soft p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-display text-sm font-semibold text-ink-900">
                Hay una version mas nueva: version {upgrade.target.versionNumber}
              </p>
              <p className="mt-1 text-sm text-ink-700">
                Esta convocatoria sigue entregando la version {upgrade.current.versionNumber}. Quien la curse hoy vera el
                contenido anterior hasta que la actualices.
              </p>
              <p className="mt-1 text-sm text-ink-500">{MIGRATION_EFFECT[upgrade.target.migrationPolicy]}</p>
            </div>
            <Button onClick={() => setMigrateOpen(true)}>
              <ArrowUpCircle size={16} />
              Actualizar a la version {upgrade.target.versionNumber}
            </Button>
          </div>
        </div>
      ) : null}

      {/*
        LOS CUATRO NUMEROS DE LA JORNADA, en el orden en que se leen: a cuantos DEBE atender, a
        cuantos ya cito, y a cuantos le FALTAN. El tercero es la pregunta que el analista se hace
        de verdad y que antes no estaba en ninguna pantalla: habia que cruzar dos listas a ojo.
      */}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Proyectados"
          value={offering.projectedCount ?? '—'}
          hint={offering.projectedFrozenAt ? `Congelados el ${formatDate(offering.projectedFrozenAt)}` : offering.derivedProjected.detail}
          accion={
            offering.projectedFrozenAt ? (
              <button
                type="button"
                onClick={() => {
                  setAjusteCount(String(offering.projectedCount ?? ''));
                  setAjusteReason('');
                  setAjusteOpen(true);
                }}
                title="Corregir el denominador de la cobertura. Pide motivo."
                aria-label="Ajustar los proyectados"
                className="focus-ring -mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-ink-500 transition-colors hover:text-ink-900"
              >
                <SlidersHorizontal className="h-4 w-4" strokeWidth={1.75} />
              </button>
            ) : null
          }
        />
        {/*
          INSCRITOS, y no "convocados": eran DOS NOMBRES para la misma fila de la base. La tarjeta
          decia una cosa y la tabla de abajo otra, y quien las lee cree que son dos cifras. Se
          convoca —el verbo— para que alguien quede INSCRITO; el sustantivo es uno solo.
        */}
        <Stat
          label="Inscritos"
          value={offering._count.enrollments}
          hint={esAutoservicio ? 'Entraron por su cuenta o los inscribieron' : 'Personas citadas a esta jornada'}
        />
        {/*
          "Faltan por convocar" no aplica en autoservicio: no hay a quien citar. Ensenarlo ahi
          invita a inscribir a mano a gente que iba a entrar sola.
        */}
        {esAutoservicio ? (
          <Stat
            label="Obligados a esta formacion"
            value={pendientes ? pendientes.proyectados : '—'}
            hint="Entran por su cuenta cuando puedan: no hay que citar a nadie"
          />
        ) : (
          <Stat
            label="Faltan por convocar"
            value={pendientes ? pendientes.faltan.length : '—'}
            hint={
              pendientes
                ? pendientes.faltan.length === 0
                  ? 'Nadie: todos los que atiende ya estan citados'
                  : 'Obligados de esta jornada sin citar en ninguna'
                : 'Calculando...'
            }
          />
        )}
        <Stat
          label="Intensidad"
          value={`${Number(offering.intensityTheoryHours ?? 0) + Number(offering.intensityPracticeHours ?? 0)} h`}
          hint={`Teorica ${Number(offering.intensityTheoryHours ?? 0)} h · practica ${Number(offering.intensityPracticeHours ?? 0)} h`}
        />
      </div>


      {/*
        QUIENES FALTAN, con nombre y apellido. El numero solo dice que hay un hueco; la lista dice
        A QUIEN hay que citar, que es lo que se necesita para actuar. Se ensena solo cuando la
        jornada esta abierta: en borrador todavia no se puede inscribir a nadie.
      */}
      {isOpen && !esAutoservicio && pendientes && pendientes.faltan.length > 0 ? (
        <section className="card mb-6 p-5">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-base font-semibold text-ink-900">Faltan por convocar</h2>
            <span className="text-sm text-ink-500">
              {pendientes.convocados} de {pendientes.proyectados} ya citados
            </span>
          </div>
          <p className="mb-4 text-sm text-ink-500">
            Estas personas tienen la formacion exigida y esta jornada las atiende, pero no estan
            citadas a ninguna. {pendientes.detalle}
          </p>
          <ul className="divide-y divide-line">
            {pendientes.faltan.slice(0, 12).map((persona) => (
              <li key={persona.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-900">{persona.fullName}</p>
                  <p className="truncate text-xs text-ink-500">
                    {persona.jobTitle.name} · {persona.area.name}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => void convocarA(persona.id)} disabled={busy}>
                  Convocar
                </Button>
              </li>
            ))}
          </ul>
          {pendientes.faltan.length > 12 ? (
            <p className="mt-3 text-xs text-ink-500">
              y {pendientes.faltan.length - 12} mas. El boton de arriba las cita a todas de una vez.
            </p>
          ) : null}
        </section>
      ) : null}
      <div className="mb-6 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="card p-5">
          <h2 className="font-display text-base font-semibold text-ink-900">Datos de la jornada</h2>
          <dl className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-ink-500">Fecha</dt>
              <dd className="text-sm text-ink-900">
                {offering.scheduledDate ? formatDate(offering.scheduledDate) : 'Permanente'}
                {offering.startTime ? ` · ${offering.startTime} a ${offering.endTime ?? ''}` : ''}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Lugar</dt>
              <dd className="text-sm text-ink-900">{offering.location ?? 'Virtual'}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Regional</dt>
              <dd className="text-sm text-ink-900">{offering.regional?.name ?? 'Todas'}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Instructor</dt>
              <dd className="text-sm text-ink-900">{offering.instructor?.fullName ?? offering.instructorExternalName ?? 'Sin asignar'}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Cupo</dt>
              <dd className="text-sm text-ink-900">{offering.capacity ?? 'Sin limite'}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Ejecutada por</dt>
              <dd className="text-sm text-ink-900">{offering.executedByOther ?? offering.executedBy}</dd>
            </div>
          </dl>
          {offering.projectedAdjustReason ? (
            <p className="mt-4 rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
              Proyectados ajustados a mano: {offering.projectedAdjustReason}
            </p>
          ) : null}
          {offering.cancelledReason ? (
            <p className="mt-4 rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">Cancelada: {offering.cancelledReason}</p>
          ) : null}
        </div>

        {/*
          LA TARJETA DEL PLAN DICE LA VERDAD SEGUN EL TIPO (2026-09-04).

          Decia "no pertenece a ningun plan — agregala desde el plan si debe contar para el programa
          anual" tambien en las CINCO formaciones que, por su tipo, **no pueden** entrar a ninguno:
          era pedirle a alguien que hiciera algo que el servidor rechaza con un 409. Lo noto el
          cliente.

          De los seis tipos solo la capacitacion del plan participa (`participatesInPlan`, Decision
          #78). En el resto la tarjeta no desaparece —"¿donde esta lo del plan?" es una pregunta
          legitima cuando esa tarjeta si sale en las de al lado— sino que dice que no entra y por que.
        */}
        <div className="card p-5">
          <h2 className="font-display text-base font-semibold text-ink-900">En el plan anual</h2>
          {!entraAlPlan ? (
            <p className="mt-2 text-sm text-ink-500">
              Una <span className="font-medium text-ink-700">{offering.activityVersion.activity.activityType.name}</span> no
              entra al plan anual: el cumplimiento del ano solo lo mueve lo que estaba planeado.
            </p>
          ) : offering.planItems.length === 0 ? (
            <p className="mt-2 text-sm text-ink-500">
              Esta convocatoria no pertenece a ningun plan. Agregala desde el plan si debe contar para el programa anual.
            </p>
          ) : (
            <ul className="mt-3 space-y-2">
              {offering.planItems.map((item) => (
                <li key={item.id} className="text-sm">
                  <Link href={`/plan/${item.plan.id}`} className="focus-ring font-medium text-ink-900 hover:underline">
                    {item.plan.name} ({item.plan.year})
                  </Link>
                  <span className="ml-2 text-xs text-ink-500">mes {item.plannedMonth}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/*
        LA LISTA DE ASISTENCIA, SOLO EN LAS JORNADAS CON FECHA (Decision #157).

        Va con el `kind` y no con la modalidad, y no es un detalle: una jornada EVENT se cierra por
        asistencia la dicte como la dicte —presencial en un salon o virtual en vivo—, porque en las
        dos hay una lista de quien estuvo y en ninguna queda contenido completado en la plataforma.
        Una PERMANENTE no: ahi la persona entra sola y la evidencia es lo que registro el sistema.
        Atarlo a PRESENCIAL dejaria fuera el webinar de la ARL.
      */}
      {/*
        Y NO EN UNA JORNADA QUE NO SE DICTO (2026-09-06). Lo cazo el cliente: aparecia "Tomar
        asistencia" en una convocatoria **CANCELADA**. El servidor ya lo rechazaba con 409, pero un
        boton que solo falla al pulsarlo no es una compuerta: es una trampa. En BORRADOR tampoco —
        todavia no se ha citado a nadie.
      */}
      {!esAutoservicio && (offering.status === 'PUBLISHED' || offering.status === 'IN_PROGRESS' || offering.status === 'COMPLETED') ? (
        <ListaDeAsistencia
          offeringId={offering.id}
          roster={roster}
          pideCertificado={offering.registraCertificadoExterno}
          quienLaDicto={offering.quienLaDicto}
          fechaDeLaJornada={offering.scheduledDate ?? null}
          onHecho={() => void load()}
        />
      ) : null}

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="font-display text-base font-semibold text-ink-900">Inscritos</h2>
          <span className="text-sm text-ink-500">{roster.length} personas</span>
        </div>
        {roster.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Nadie inscrito todavia"
            description={
              isOpen
                ? 'Inscribe a quienes ya tienen la obligacion de esta actividad en la sede de la convocatoria.'
                : 'Publica la convocatoria para poder inscribir personas.'
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <Tr>
                  <Th>Persona</Th>
                  <Th>Cargo</Th>
                  <Th>Area</Th>
                  <Th>Origen</Th>
                  <Th>Estado</Th>
                </Tr>
              </THead>
              <TBody>
                {roster.map((row) => (
                  <Tr key={row.id}>
                    <Td>
                      <div className="font-medium text-ink-900">{row.user.fullName}</div>
                      <div className="font-mono text-xs text-ink-500">{row.user.documentNumber}</div>
                    </Td>
                    <Td className="text-ink-700">{row.user.jobTitle.name}</Td>
                    <Td className="text-ink-500">{row.user.area.name}</Td>
                    <Td className="text-ink-500">{row.assignmentId ? 'Obligacion' : 'Inscripcion directa'}</Td>
                    <Td>
                      {/*
                        COMO CONSTA, no solo si consta (Decision #157). Una formacion cerrada por
                        ASISTENCIA y una cerrada por la plataforma valen lo mismo para el indicador
                        y NO son la misma evidencia: la primera la respalda una hoja firmada y la
                        segunda el registro del sistema. Quien audita pregunta por cual de las dos.
                      */}
                      <StatusPill
                        kind={row.completedAt ? 'ok' : 'neutral'}
                        label={row.completedAt ? (row.attendedAt ? 'ASISTIO' : 'COMPLETADA') : 'INSCRITO'}
                      />
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </div>

      <Drawer
        open={ajusteOpen}
        onOpenChange={setAjusteOpen}
        title="Ajustar los proyectados"
        description="Es el denominador de la cobertura. Se congelo al publicar y solo se corrige con motivo."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAjusteOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={ajustar}
              loading={busy}
              disabled={ajusteReason.trim().length < 10 || !Number.isInteger(Number(ajusteCount)) || Number(ajusteCount) < 0}
            >
              Guardar el ajuste
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="rounded-md bg-paper px-3 py-2 text-sm text-ink-700">
            Congelados el {offering.projectedFrozenAt ? formatDate(offering.projectedFrozenAt) : '—'} en{' '}
            <strong>{offering.projectedCount ?? '—'}</strong>. Hoy se derivarian{' '}
            <strong>{offering.derivedProjected.count}</strong>: {offering.derivedProjected.detail}
          </div>
          <Field htmlFor="a-count" label="Proyectados" required hint="Cuantas personas deberian capacitarse de verdad en esta jornada.">
            <Input id="a-count" type="number" min={0} value={ajusteCount} onChange={(event) => setAjusteCount(event.target.value)} />
          </Field>
          <Field
            htmlFor="a-reason"
            label="Motivo del ajuste"
            required
            hint="Minimo 10 caracteres. Queda en la auditoria y visible en la convocatoria: es lo que lee quien audita."
          >
            <Input id="a-reason" value={ajusteReason} onChange={(event) => setAjusteReason(event.target.value)} maxLength={500} />
          </Field>
        </div>
      </Drawer>

      <Drawer
        open={publishOpen}
        onOpenChange={setPublishOpen}
        title="Publicar convocatoria"
        description="Publicar congela los proyectados: es el denominador de la cobertura y no se recalcula despues."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPublishOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={publish} loading={busy}>
              Publicar
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="rounded-md bg-info-soft px-3 py-2 text-sm text-info">
            Proyectados derivados: <strong>{offering.derivedProjected.count}</strong>. {offering.derivedProjected.detail}
          </div>
          {/*
            AQUI SOLO SE ENSENA lo que se va a congelar; corregirlo se hace despues, sobre la cifra
            ya congelada (ver la nota de `ajusteOpen`). Publicar es una decision; corregir el
            denominador es otra, y mezclarlas hacia que el motivo de la correccion —la evidencia que
            lee el auditor— se escribiera antes de que hubiera nada que corregir.
          */}
        </div>
      </Drawer>

      {/*
        Antes de mover a nadie se ensena A CUANTOS mueve y a cuantos no, en numeros que suman el
        total de inscritos. Autorizar un cambio sobre gente citada sin ver a cuantos afecta es
        firmar en blanco.
      */}
      <Drawer
        open={migrateOpen}
        onOpenChange={setMigrateOpen}
        title={`Actualizar a la version ${upgrade.target?.versionNumber ?? ''}`}
        description="La politica de migracion la fijo quien publico esa version; aqui solo se aplica."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setMigrateOpen(false)}>
              Volver
            </Button>
            <Button onClick={migrate} loading={busy}>
              Actualizar
            </Button>
          </div>
        }
      >
        {upgrade.available && upgrade.target && upgrade.enrollments ? (
          <div className="space-y-4">
            <div className="rounded-md bg-info-soft px-3 py-2 text-sm text-info">
              {MIGRATION_EFFECT[upgrade.target.migrationPolicy]}
            </div>

            <dl className="grid gap-2 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-700">Pasan a la version {upgrade.target.versionNumber}</dt>
                <dd className="font-display text-lg font-semibold tabular-nums text-ink-900">{upgrade.enrollments.moving}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-500">Siguen en la version {upgrade.current.versionNumber}</dt>
                <dd className="tabular-nums text-ink-700">{upgrade.enrollments.keepOldVersion}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-ink-500">Ya cerradas (no se tocan nunca)</dt>
                <dd className="tabular-nums text-ink-700">{upgrade.enrollments.frozen}</dd>
              </div>
              {upgrade.enrollments.alreadyOnTarget > 0 ? (
                <div className="flex items-baseline justify-between gap-3">
                  <dt className="text-ink-500">Ya estaban en la nueva</dt>
                  <dd className="tabular-nums text-ink-700">{upgrade.enrollments.alreadyOnTarget}</dd>
                </div>
              ) : null}
            </dl>

            {upgrade.enrollments.conflicted > 0 ? (
              <p className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
                {upgrade.enrollments.conflicted}{' '}
                {upgrade.enrollments.conflicted === 1 ? 'persona se queda' : 'personas se quedan'} donde esta: ya{' '}
                {upgrade.enrollments.conflicted === 1 ? 'tiene' : 'tienen'} otra inscripcion abierta de esa misma version en
                otra convocatoria. Moverla dejaria dos y el avance no sabria a cual ir.
              </p>
            ) : null}

            <p className="text-sm text-ink-500">
              El avance de quien se mueve no se borra: queda apuntando a los contenidos de la version anterior, deja de
              contar y sigue disponible para auditoria.
            </p>

            <Field
              htmlFor="m-reason"
              label="Justificacion"
              hint="Queda en la auditoria. Obligatoria si necesitas aprobacion del administrador."
            >
              <Input id="m-reason" value={migrateReason} onChange={(event) => setMigrateReason(event.target.value)} maxLength={500} />
            </Field>
          </div>
        ) : (
          <p className="text-sm text-ink-500">Esta convocatoria ya esta en la version vigente.</p>
        )}
      </Drawer>

      <Drawer
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancelar convocatoria"
        description="Se desconvoca la jornada y el renglon del plan queda como cancelado."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>
              Volver
            </Button>
            <Button onClick={cancel} loading={busy} disabled={cancelReason.trim().length < 10}>
              Cancelar convocatoria
            </Button>
          </div>
        }
      >
        <Field htmlFor="c-reason" label="Motivo" required hint="Minimo 10 caracteres. Queda registrado.">
          <Input id="c-reason" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} maxLength={500} />
        </Field>
      </Drawer>
    </div>
  );
}
