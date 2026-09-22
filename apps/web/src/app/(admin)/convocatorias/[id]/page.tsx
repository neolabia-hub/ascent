'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ArrowUpCircle,
  CheckCircle2,
  ExternalLink,
  Search,
  Send,
  SlidersHorizontal,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { ApiError, motivoDelError } from '@/lib/api';
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
import { SesionEnSala } from '@/components/modules/delivery/sesion-en-sala';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Drawer } from '@/components/ui/drawer';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { TablePagination } from '@/components/ui/table';
import { StatusPill, type StatusPillKind } from '@/components/ui/status-pill';
import { useToast } from '@/components/ui/toast';

/** Doce por pagina: lo que cabe sin que la tarjeta empuje a la lista de inscritos fuera de la vista. */
const FALTAN_POR_PAGINA = 12;

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
    'Quien ya estaba inscrito TERMINA en la versión anterior. La versión nueva la veran solo quiénes se inscriban de aquí en adelante.',
  MOVE_NOT_STARTED:
    'Pasan a la versión nueva quiénes todavía no han abierto nada. Quien ya empezo termina en la anterior, para no quitarle el avance.',
  RESTART_NEW:
    'Todos los que no han cerrado pasan a la versión nueva y vuelven a empezar. Lo ya completado no se toca.',
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
  /** Accion pequeña en la esquina, para el numero que se puede corregir. */
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
  const [buscaFaltan, setBuscaFaltan] = useState('');
  const [buscadorFaltanAbierto, setBuscadorFaltanAbierto] = useState(false);
  const [paginaFaltan, setPaginaFaltan] = useState(0);

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
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo cargar la convocatoria', description: motivoDelError(error) });
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
          : { kind: 'info', title: 'Enviado a aprobación', description: 'Un administrador debe autorizar el ajuste.' },
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
          : { kind: 'info', title: 'Enviada a aprobación', description: 'Un administrador debe autorizar la publicación.' },
      );
      setPublishOpen(false);
      await load();
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo publicar', description: motivoDelError(error) });
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
          : { kind: 'info', title: 'Enviada a aprobación', description: 'Un administrador debe autorizar la cancelacion.' },
      );
      setCancelOpen(false);
      setCancelReason('');
      await load();
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo cancelar', description: motivoDelError(error) });
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
              : 'No había obligados sin inscribir',
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
              title: `Convocatoria actualizada a la versión ${target.versionNumber}`,
              description: 'Se aplico la politica de migración que se eligio al publicarla.',
            }
          : { kind: 'info', title: 'Enviada a aprobación', description: 'Un administrador debe autorizar el cambio.' },
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
        title: superseded ? 'Se publico otra versión mientras decidias' : 'No se pudo actualizar',
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
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo cerrar', description: motivoDelError(error) });
    } finally {
      setBusy(false);
    }
  };

  /*
    QUIENES FALTAN, BUSCABLES Y POR PAGINAS. Ver la nota larga en el bloque que los pinta.

    Va ANTES del `return` temprano de abajo a proposito: un `useMemo` detras de un return
    condicional se salta en el primer render y React lo castiga con "rendered fewer hooks than
    expected", que es un error que no se parece en nada a su causa.
  */
  const faltanFiltrados = useMemo(() => {
    const todos = pendientes?.faltan ?? [];
    const q = buscaFaltan.trim().toLowerCase();
    if (q === '') return todos;
    return todos.filter(
      (persona) =>
        persona.fullName.toLowerCase().includes(q) ||
        persona.jobTitle.name.toLowerCase().includes(q) ||
        persona.area.name.toLowerCase().includes(q),
    );
  }, [pendientes, buscaFaltan]);
  const faltanVisibles = faltanFiltrados.slice(
    paginaFaltan * FALTAN_POR_PAGINA,
    (paginaFaltan + 1) * FALTAN_POR_PAGINA,
  );

  if (!offering) return <Skeleton className="h-96 w-full" />;

  const activity = offering.activityVersion.activity;
  const state = STATUS_LABEL[offering.status];
  const isDraft = offering.status === 'DRAFT';
  const isOpen = offering.status === 'PUBLISHED' || offering.status === 'IN_PROGRESS';
  /**
   * AUTOSERVICIO: la persona entra sola. Aqui "convocar" no significa nada —nadie cita a nadie— y
   * enseñar "faltan por convocar" invita a inscribir a mano a gente que iba a entrar sola, lo que
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
            {/*
              EL TITULO ABRE LA FORMACION (2026-09-21).

              Desde una convocatoria no habia forma de llegar a su formacion salvo ir al catalogo y
              buscarla por el nombre — y desde aqui se necesita a cada rato: para mirar el temario,
              la pestaña de «Quienes» o publicar una version. La flecha de arriba solo vuelve alla
              cuando se vino de alli; llegando desde el listado de convocatorias, no lleva a ninguna.

              Va en el TITULO y no en un boton mas porque el nombre de la formacion ya estaba ahi
              siendo lo que uno intenta pulsar. El subrayado aparece al pasar por encima: en una
              cabecera no hace falta anunciarlo, y permanente ensuciaria la unica linea grande de la
              pantalla.
            */}
            <Link
              href={`/contenido-formativo/${activity.id}`}
              title="Abrir la formación"
              className="focus-ring group inline-flex items-center gap-2 rounded"
            >
              <h1 className="font-display text-[28px] font-semibold text-ink-900 group-hover:underline">
                {activity.name}
              </h1>
              <ExternalLink size={16} className="text-ink-500 group-hover:text-ink-900" aria-hidden="true" />
            </Link>
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
                Hay una versión mas nueva: versión {upgrade.target.versionNumber}
              </p>
              <p className="mt-1 text-sm text-ink-700">
                Esta convocatoria sigue entregando la version {upgrade.current.versionNumber}. Quien la curse hoy vera el
                contenido anterior hasta que la actualices.
              </p>
              <p className="mt-1 text-sm text-ink-500">{MIGRATION_EFFECT[upgrade.target.migrationPolicy]}</p>
            </div>
            <Button onClick={() => setMigrateOpen(true)}>
              <ArrowUpCircle size={16} />
              Actualizar a la versión {upgrade.target.versionNumber}
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
            label="Obligados a esta formación"
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
            {/*
              LA MODALIDAD YA NO SE REPITE AQUI (2026-09-07).

              Estaba en estos datos y otra vez en la tarjeta de al lado. El cliente pregunto si era
              redundante: aqui SI lo era. Vive en "Como se cierra esta jornada", que es donde
              significa algo —es el primer eslabon de la cadena que acaba en como se da por
              cumplida— y no un dato suelto entre el lugar y el cupo.
            */}
            <div>
              <dt className="text-xs text-ink-500">Lugar</dt>
              <dd className="text-sm text-ink-900">{offering.location ?? 'Virtual'}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Regional</dt>
              <dd className="text-sm text-ink-900">{offering.regional?.name ?? 'Todas'}</dd>
            </div>
            {/*
              EL ACOTAMIENTO — LA TAJADA (Decision #68), que no se veia en ninguna parte.

              Es a QUE PARTE de los obligados atiende esta jornada, y estaba solo en el formulario de
              crearla. Sin el, el numero de "Faltan por convocar" de aqui arriba no se puede
              interpretar: no es lo mismo que falten seis de toda la empresa a que falten seis de los
              conductores de Bogota, que es lo unico que esta jornada atiende.
            */}
            <div>
              <dt className="text-xs text-ink-500">A quien atiende</dt>
              <dd className="text-sm text-ink-900">
                {offering.audience?.name ?? 'A todos los obligados de esta formación'}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Instructor</dt>
              <dd className="text-sm text-ink-900">{offering.instructor?.fullName ?? offering.instructorExternalName ?? 'Sin asignar'}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Ejecutada por</dt>
              <dd className="text-sm text-ink-900">{offering.executedByOther ?? offering.executedBy}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Cupo</dt>
              <dd className="text-sm text-ink-900">{offering.capacity ?? 'Sin limite'}</dd>
            </div>
            {/*
              LA INTENSIDAD, DESGLOSADA (Decision #30): el PESV la exige separada y BPM suma las
              10 h/año. Estaba en el formulario y no se veia en la ficha, que es donde la busca
              quien prepara una auditoria.
            */}
            <div>
              <dt className="text-xs text-ink-500">Intensidad</dt>
              <dd className="text-sm text-ink-900">
                {offering.intensityTheoryHours !== null || offering.intensityPracticeHours !== null
                  ? `${offering.intensityTheoryHours ?? 0} h teoricas · ${offering.intensityPracticeHours ?? 0} h practicas`
                  : 'Sin registrar'}
              </dd>
            </div>
            {/*
              LAS OBSERVACIONES, QUE SE ESCRIBIAN Y NO VOLVIAN A APARECER.

              El campo existe en el modelo y en el formulario de crear la convocatoria desde el
              principio, y esta pantalla no lo enseñaba: lo que alguien anotaba —"el salon cambio al
              bloque B", "vienen los de mantenimiento del turno de la noche"— se escribia una vez y
              se perdia. Es texto libre de quien organiza, asi que va al ancho completo y al final,
              debajo de los datos con forma.
            */}
            {offering.observations ? (
              <div className="sm:col-span-2">
                <dt className="text-xs text-ink-500">Observaciones</dt>
                <dd className="whitespace-pre-line text-sm text-ink-700">{offering.observations}</dd>
              </div>
            ) : null}
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
          LA COLUMNA DE LA DERECHA: COMO CUENTA ESTA JORNADA (2026-09-06).

          ─── QUE PROBLEMA RESUELVE ───

          Aqui solo estaba "En el plan anual", y solo cuando la formacion podia entrar a uno. En los
          seis tipos que no participan la tarjeta desaparecia y los datos de la jornada se quedaban
          con dos tercios de ancho y media pantalla vacia al lado. Lo noto el cliente.

          ─── POR QUE UNA TARJETA CON MAS COSAS Y NO SOLO ESTIRAR LA DE LA IZQUIERDA ───

          Porque hay dos clases de dato en esta pantalla y estaban mezcladas. A la izquierda, los
          HECHOS de la sesion: cuando, donde, quien la dicta, cuantas horas — se leen de un tiron y
          se comparan con la citacion. A la derecha, lo que se DEDUCE de ellos y gobierna la
          jornada: como se cierra, si va a pedir el papel de un tercero, y a que plan cuenta.

          Las dos preguntas que mas llegan —"¿por que no me sale el boton de tomar asistencia?" y
          "¿esto cuenta para el plan del año?"— se contestan las dos aqui, juntas, en vez de una
          perdida al final de una lista de nueve datos y la otra en una tarjeta que a veces no
          esta. Y como siempre tiene contenido, la pagina ya no cambia de forma segun el tipo de
          formacion, que es lo que hacia que se viera rota.
        */}
        <div className="card h-fit p-5">
          {/*
            TRES PREGUNTAS QUE SUENAN IGUAL Y NO LO SON (reescrito el 2026-09-07).

            El cliente pregunto literalmente *"¿que tiene que ver «como se hace» con la modalidad y
            con «como se acredita»?"*, y la tarjeta tenia la culpa: enseñaba tres rotulos parecidos
            —modalidad, como se acredita, certificado de un tercero— sin decir que cada uno contesta
            una pregunta distinta. Puestos en fila y sin explicar, se leen como el mismo dato tres
            veces.

            Son tres eslabones de una cadena, y ahora se enseñan como tal:

              1. COMO SE DICTA        presencial, virtual o hibrida. Es logistica: donde va la gente.
              2. COMO SE DA POR       con la hoja firmada de la sesion, o con lo que cada persona
                 CUMPLIDA             complete en la plataforma. Es la EVIDENCIA, y es lo que decide
                                      si sale el boton de tomar asistencia.
              3. QUE PAPEL QUEDA      si ademas de lo anterior hay un certificado de otra entidad
                                      —la ARL— con su propio numero y su propio vencimiento.

            El 1 casi siempre sugiere el 2, pero **no lo decide**: una capacitacion por videollamada
            es virtual y tiene lista de quien se conecto; un taller presencial puede acreditarse con
            lo que cada quien haga despues. Por eso el 2 se pregunta y no se deduce (Decision #158),
            y por eso viene RESUELTO del servidor (`cierre-de-la-jornada.ts`): la regla cambio dos
            veces en dos dias y no puede vivir tambien aqui.

            Y el 3 es independiente de los dos: quien no vino no tiene papel, y quien cumplio en la
            plataforma tampoco — pero una recertificacion presencial deja los dos, la constancia de
            la empresa y el papel de la ARL, que dicen cosas distintas (Decision #159).
          */}
          <h2 className="font-display text-base font-semibold text-ink-900">Como se cierra esta jornada</h2>
          <dl className="mt-3 space-y-4">
            <div>
              <dt className="text-xs text-ink-500">Como se dicta</dt>
              <dd className="text-sm text-ink-900">
                {offering.modality === 'PRESENCIAL' ? 'Presencial' : offering.modality === 'VIRTUAL' ? 'Virtual' : 'Hibrida'}
                <span className="ml-1.5 text-xs text-ink-500">
                  {offering.modality === 'VIRTUAL' ? '(donde se conecta la gente)' : '(donde va la gente)'}
                </span>
              </dd>
            </div>
            {/*
              DOS RENGLONES DESDE EL 2026-09-21, porque son dos hechos (`PENDIENTES` 2.7): lo que
              ACREDITA y si ademas SE TOMA LISTA. Con uno solo, una jornada que se cierra por
              contenido y aun asi pasa lista no tenia forma de decirlo, y quien leia la ficha daba
              por hecho que no habia lista.
            */}
            <div>
              <dt className="text-xs text-ink-500">Qué se exige</dt>
              <dd className="text-sm text-ink-900">
                {offering.exigencia === 'ATTENDANCE'
                  ? 'La lista de asistencia de la sesión'
                  : offering.exigencia === 'BOTH'
                    ? 'Las dos cosas: asistir y aprobar'
                    : 'Completar el contenido en la plataforma'}
                {/*
                  Y DE DONDE SALIO ESA RESPUESTA, que es la mitad que faltaba: no es lo mismo que
                  alguien lo eligiera para esta jornada que que lo sugiriera su modalidad. Sin esto,
                  quien mira no sabe si puede cambiarlo ni por que dice lo que dice.
                */}
                <span className="ml-1.5 text-xs text-ink-500">
                  {offering.completionRequirement !== null
                    ? '(elegido para esta jornada)'
                    : '(lo sugirio la modalidad)'}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Lista de asistencia</dt>
              <dd className="text-sm text-ink-900">
                {!offering.admiteAsistencia
                  ? 'No se toma'
                  : offering.exigencia === 'CONTENT'
                    ? 'Sí se toma, como evidencia'
                    : 'Sí se toma'}
                <span className="ml-1.5 text-xs text-ink-500">
                  {!offering.admiteAsistencia
                    ? '(no hay sesión que registrar)'
                    : offering.exigencia === 'CONTENT'
                      ? '(queda en el expediente, pero no cierra la formación)'
                      : '(QR, firma o a mano)'}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">Papel de un tercero</dt>
              <dd className="text-sm text-ink-900">
                {offering.registraCertificadoExterno
                  ? `Si, lo expide ${offering.quienLaDicto}`
                  : 'No lleva'}
                {/*
                  Y DONDE SE ESCRIBE, QUE ES DONDE LA PANTALLA MENTIA (2026-09-08).

                  Decia siempre "la lista pedira su numero y su vencimiento". Pero **llevar papel y
                  cerrarse por lista son dos condiciones independientes**: `registraCertificadoExterno`
                  sale de la formacion y `admiteAsistencia` de como se dicto esta jornada. Si una
                  formacion lleva papel y su jornada se cierra al completar el contenido —un curso en
                  linea de la ARL que emite certificado— **no hay ninguna lista**, y por tanto hoy no
                  hay donde escribirlo.

                  Lo cazo el cliente preguntando justo por ese cruce. Es raro y no se inventa una
                  pantalla para el ahora —esa es la segunda puerta, `PENDIENTES` 2.2 y 2.3— pero
                  prometer una lista que no va a aparecer es peor que no decir nada: quien lo lee
                  cierra la jornada esperando que le pregunten, y no le preguntan.

                  Desde el 2026-09-21 la condicion es «¿HAY lista?» y no «¿la lista acredita?». Una
                  jornada que se cierra por contenido y aun asi pasa lista **si** pide el papel: el
                  papel es EVIDENCIA, no una acreditacion, y el instructor lo tiene en la mano al
                  terminar la sesion. Que la formacion quede cumplida lo decide la exigencia de la
                  jornada, nunca el certificado. Sin lista, sigue siendo la ficha de la persona.
                */}
                <span className="ml-1.5 text-xs text-ink-500">
                  {!offering.registraCertificadoExterno
                    ? '(solo queda la constancia de la empresa)'
                    : offering.admiteAsistencia
                      ? '(la lista pedira su número y su vencimiento)'
                      : '(se registra desde la ficha de la persona, en Usuarios)'}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-500">En el plan anual</dt>
              {!entraAlPlan ? (
                <dd className="text-sm text-ink-700">
                  No aplica: una{' '}
                  <span className="font-medium text-ink-900">{offering.activityVersion.activity.activityType.name}</span>{' '}
                  no entra al plan. El cumplimiento del año solo lo mueve lo que estaba planeado.
                </dd>
              ) : offering.planItems.length === 0 ? (
                <dd className="text-sm text-ink-500">
                  No pertenece a ningun plan. Agregala desde el plan si debe contar para el programa anual.
                </dd>
              ) : (
                <dd>
                  <ul className="space-y-1">
                    {offering.planItems.map((item) => (
                      <li key={item.id} className="text-sm">
                        <Link href={`/plan/${item.plan.id}`} className="focus-ring font-medium text-ink-900 hover:underline">
                          {item.plan.name} ({item.plan.year})
                        </Link>
                        <span className="ml-2 text-xs text-ink-500">mes {item.plannedMonth}</span>
                      </li>
                    ))}
                  </ul>
                </dd>
              )}
            </div>
          </dl>
        </div>
      </div>

      {/*
        QUIENES FALTAN, con nombre y apellido. El numero solo dice que hay un hueco; la lista dice
        A QUIEN hay que citar, que es lo que se necesita para actuar. Se enseña solo cuando la
        jornada esta abierta: en borrador todavia no se puede inscribir a nadie.
      */}
      {isOpen && !esAutoservicio && pendientes && pendientes.faltan.length > 0 ? (
        <section className="card mb-6 p-5">
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-base font-semibold text-ink-900">Faltan por convocar</h2>
            <div className="flex items-center gap-3">
              <span className="text-sm text-ink-500">
                {pendientes.convocados} de {pendientes.proyectados} ya citados
              </span>
              {/*
                EL BUSCADOR, DETRAS DE SU LUPA (2026-09-06).

                Aqui SI se esconde —al reves que en la lista de asistencia, donde se queda a la
                vista— porque son dos usos distintos. En la asistencia se busca a alguien concreto
                cada vez que se abre; aqui lo normal es leer los doce primeros o pulsar "convocar a
                todos", y buscar es la excepcion de cuando falta una persona concreta entre ciento
                cuarenta. Un buscador siempre visible para un uso excepcional es una caja vacia
                permanente encima de la lista.
              */}
              {pendientes.faltan.length > FALTAN_POR_PAGINA ? (
                <button
                  type="button"
                  aria-expanded={buscadorFaltanAbierto}
                  aria-label="Buscar entre quienes faltan por convocar"
                  onClick={() => {
                    const abrir = !buscadorFaltanAbierto;
                    setBuscadorFaltanAbierto(abrir);
                    if (!abrir) { setBuscaFaltan(''); setPaginaFaltan(0); }
                  }}
                  className={cn(
                    'focus-ring flex h-8 w-8 items-center justify-center rounded-lg border border-line-strong transition-colors duration-150',
                    buscadorFaltanAbierto ? 'bg-paper text-ink-900' : 'bg-surface text-ink-500 hover:bg-paper hover:text-ink-900',
                  )}
                >
                  <Search size={15} strokeWidth={1.75} aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </div>
          <p className="mb-4 text-sm text-ink-500">
            Estas personas tienen la formacion exigida y esta jornada las atiende, pero no estan
            citadas a ninguna. {pendientes.detalle}
          </p>
          {/*
            BUSCADOR Y PAGINAS, PORQUE CON CIENTO CUARENTA NO SERVIA (2026-09-06).

            Enseñaba doce y remataba con "y 132 mas. El boton de arriba las cita a todas de una vez",
            y ahi se acababa la pantalla. Lo cazo el cliente, y el problema no era la cifra: era que
            **a las otras 132 no habia forma de llegar**. Quien entra aqui casi nunca quiere citarlas
            a todas —para eso ya esta el boton de arriba— sino a una concreta que sabe que falta, y
            esa persona podia estar en cualquier sitio de una lista invisible.

            Buscador por nombre, cargo o area, y paginas de doce. `TablePagination` se reutiliza tal
            cual aunque esto no sea una tabla: es la misma pregunta —"¿por donde voy de cuantos?"— y
            dos formas de pasar pagina en el mismo modulo se aprenden dos veces.

            La pagina se reinicia al escribir: quedarse en la pagina 4 de un resultado de tres es la
            forma mas rapida de que una lista parezca vacia.
          */}
          {buscadorFaltanAbierto ? (
            <div className="relative mb-3 w-full sm:w-80">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-500" />
              <Input
                autoFocus
                className="h-9 rounded-lg pl-9"
                placeholder="Buscar por nombre, cargo o area"
                aria-label="Buscar entre quienes faltan por convocar"
                value={buscaFaltan}
                onChange={(event) => {
                  setBuscaFaltan(event.target.value);
                  setPaginaFaltan(0);
                }}
              />
            </div>
          ) : null}
          <ul className="divide-y divide-line">
            {faltanVisibles.map((persona) => (
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
          {faltanFiltrados.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-500">
              Ninguna de las {pendientes.faltan.length} personas que faltan coincide con la busqueda.
            </p>
          ) : null}
          {faltanFiltrados.length > FALTAN_POR_PAGINA ? (
            <TablePagination
              from={paginaFaltan * FALTAN_POR_PAGINA + 1}
              to={Math.min((paginaFaltan + 1) * FALTAN_POR_PAGINA, faltanFiltrados.length)}
              total={faltanFiltrados.length}
              canPrevious={paginaFaltan > 0}
              canNext={(paginaFaltan + 1) * FALTAN_POR_PAGINA < faltanFiltrados.length}
              onPrevious={() => setPaginaFaltan((p) => Math.max(0, p - 1))}
              onNext={() => setPaginaFaltan((p) => p + 1)}
            />
          ) : null}
        </section>
      ) : null}
      {/*
        LOS INSCRITOS Y SU ASISTENCIA, EN UNA SOLA TARJETA (2026-09-06).

        Habia dos tablas con la MISMA gente: esta y la de tomar asistencia debajo. Lo noto el
        cliente. Ahora es una con dos modos, y no se perdio ninguna columna de las que habia.

        `admiteAsistencia` viene RESUELTO del servidor (`cierre-de-la-jornada.ts`): la condicion
        cambio dos veces en dos dias, asi que es justo la que no puede vivir tambien aqui.

        Y el boton no sale en una jornada que no se dicto —CANCELADA o en BORRADOR—: el servidor ya
        lo rechazaba, pero un boton que solo falla al pulsarlo no es una compuerta, es una trampa.
      */}
      {/*
        LA SALA VA ENCIMA DE LA LISTA (2026-09-08).

        Es lo que se usa MIENTRAS pasa la jornada —se proyecta el codigo y la gente escanea— y la
        lista es lo que se repasa despues. Ponerlo debajo obligaria a bajar la pagina entera con el
        salon esperando.

        Se enseña con la misma condicion que la lista: si esta jornada no se cierra por asistencia,
        un QR no acredita nada.
      */}
      <SesionEnSala
        offeringId={offering.id}
        onCambio={() => void load()}
        activa={
          offering.admiteAsistencia &&
          (offering.status === 'PUBLISHED' || offering.status === 'IN_PROGRESS' || offering.status === 'COMPLETED')
        }
      />
      <ListaDeAsistencia
        offeringId={offering.id}
        roster={roster}
        admiteAsistencia={
          offering.admiteAsistencia &&
          (offering.status === 'PUBLISHED' || offering.status === 'IN_PROGRESS' || offering.status === 'COMPLETED')
        }
        puedeInscribir={isOpen}
        pideCertificado={offering.registraCertificadoExterno}
        quienLaDicto={offering.quienLaDicto}
        fechaDeLaJornada={offering.scheduledDate ?? null}
        onHecho={() => void load()}
      />

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
            ayuda="Mínimo 10 caracteres. Queda en la auditoria y visible en la convocatoria: es lo que lee quien audita."
          >
            <Input id="a-reason" value={ajusteReason} onChange={(event) => setAjusteReason(event.target.value)} maxLength={500} />
          </Field>
        </div>
      </Drawer>

      <Drawer
        open={publishOpen}
        onOpenChange={setPublishOpen}
        title="Publicar convocatoria"
        description="Publicar congela los proyectados: es el denominador de la cobertura y no se recalcula después."
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
        Antes de mover a nadie se enseña A CUANTOS mueve y a cuantos no, en numeros que suman el
        total de inscritos. Autorizar un cambio sobre gente citada sin ver a cuantos afecta es
        firmar en blanco.
      */}
      <Drawer
        open={migrateOpen}
        onOpenChange={setMigrateOpen}
        title={`Actualizar a la versión ${upgrade.target?.versionNumber ?? ''}`}
        description="La politica de migración la fijo quien publico esa versión; aquí solo se aplica."
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
                <dt className="text-ink-700">Pasan a la versión {upgrade.target.versionNumber}</dt>
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
              label="Justificación"
              hint="Queda en la auditoria. Obligatoria si necesitas aprobación del administrador."
            >
              <Input id="m-reason" value={migrateReason} onChange={(event) => setMigrateReason(event.target.value)} maxLength={500} />
            </Field>
          </div>
        ) : (
          <p className="text-sm text-ink-500">Esta convocatoria ya esta en la versión vigente.</p>
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
        <Field htmlFor="c-reason" label="Motivo" required hint="Mínimo 10 caracteres. Queda registrado.">
          <Input id="c-reason" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} maxLength={500} />
        </Field>
      </Drawer>
    </div>
  );
}
