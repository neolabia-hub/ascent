'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CalendarRange, CheckCircle2, ClipboardList, Layers, Link2, Plus, Rows3, Search, ShieldCheck, Sparkles } from 'lucide-react';
import { ApiError } from '@/lib/api';
import {
  activatePlan,
  addPlanItem,
  adjustProjected,
  approvePlan,
  closePlan,
  getPlan,
  listOfferings,
  removePlanItem,
  updatePlanItem,
  type OfferingListItem,
  type PlanDetail,
  type PlanItemRow,
  type PlanItemStatus,
  type PlanStatus,
} from '@/lib/delivery-api';
import { formatDate, monthName, MONTHS } from '@/lib/format';
import { NewOfferingDrawer } from '@/components/modules/delivery/new-offering-drawer';
import { useCan } from '@/components/providers/session-provider';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Drawer } from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill, type StatusPillKind } from '@/components/ui/status-pill';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';

/**
 * EL PLAN DEL ANO, visto como se piensa.
 *
 * Antes esto era una tabla plana de renglones y un desplegable de cien convocatorias para agregar
 * uno. Dos cosas fallaban, y las dos las dijo el cliente:
 *
 *  1. **Obligaba a salir del plan para todo.** La convocatoria tenia que existir ANTES, asi que
 *     planear el ano eran cuatro pantallas por linea: crear la actividad, publicarla, ir a
 *     Convocatorias, crear la jornada y volver aqui a buscarla.
 *  2. **La tabla plana no se parece a un plan.** Una reinduccion con tres jornadas —Bogota,
 *     Medellin, Barranquilla— salian como tres filas casi identicas, sin que se viera que son la
 *     misma capacitacion.
 *
 * Ahora hay TRES VISTAS del mismo plan, y cada una contesta una pregunta distinta:
 *  - **Por capacitacion**: que se va a dictar este ano y con cuantas jornadas cada cosa.
 *  - **Cronograma**: que toca en marzo. Es el Excel de doce columnas que ya tienen, pero vivo:
 *    cada jornada se arrastra de mes y eso queda como REPROGRAMADA.
 *  - **Por sistema de gestion**: lo que pide el auditor —el plan SST, el PESV y el BASC son vistas
 *    del mismo plan—.
 *
 * Lo que NO cambia es el modelo: el plan REFERENCIA convocatorias, no se apropia de la actividad
 * (regla de oro 3), y sus metricas se calculan solo sobre lo nacido del plan (regla de oro 2).
 */

const PLAN_STATUS: Record<PlanStatus, { kind: StatusPillKind; label: string }> = {
  DRAFT: { kind: 'neutral', label: 'BORRADOR' },
  APPROVED: { kind: 'info', label: 'APROBADO' },
  ACTIVE: { kind: 'ok', label: 'EN EJECUCION' },
  CLOSED: { kind: 'neutral', label: 'CERRADO' },
};

const ITEM_STATUS: Record<PlanItemStatus, { kind: StatusPillKind; label: string }> = {
  PLANNED: { kind: 'neutral', label: 'PROGRAMADA' },
  EXECUTED: { kind: 'ok', label: 'EJECUTADA' },
  RESCHEDULED: { kind: 'warn', label: 'REPROGRAMADA' },
  CANCELLED: { kind: 'danger', label: 'CANCELADA' },
};

/**
 * Se llama POR PROCESO y no "por sistema de gestion".
 *
 * El glosario y el formulario de la actividad ya dicen "Proceso" —SGI, SST, PESV, SARLAFT— y tener
 * dos nombres para lo mismo es justo lo que ese documento existe para evitar: quien lee "sistema de
 * gestion" en una pestana y "Proceso" en un campo, se pregunta si son cosas distintas.
 */
type PlanView = 'capacitacion' | 'mes' | 'proceso' | 'tabla';

/** Una capacitacion del plan con todas sus jornadas. */
interface ActivityGroup {
  activityId: string;
  activityName: string;
  processName: string;
  versionId: string;
  versionNumber: number;
  items: PlanItemRow[];
  projected: number;
  trained: number;
  executed: number;
}

/**
 * Agrupa los renglones por CAPACITACION, conservando el orden de mes dentro de cada una.
 *
 * Los proyectados se suman del valor CONGELADO cuando existe: es el que sostiene el indicador de
 * cobertura, y el vivo de la convocatoria puede haberse movido despues (regla de oro 5).
 */
function groupByActivity(items: PlanItemRow[]): ActivityGroup[] {
  const groups = new Map<string, ActivityGroup>();
  for (const item of items) {
    const activity = item.offering.activityVersion.activity;
    const existing = groups.get(activity.id);
    const projected = item.projectedSnapshot ?? item.offering.projectedCount ?? 0;
    if (existing) {
      existing.items.push(item);
      existing.projected += projected;
      existing.trained += item.facts?.trained ?? 0;
      if (item.status === 'EXECUTED') existing.executed += 1;
    } else {
      groups.set(activity.id, {
        activityId: activity.id,
        activityName: activity.name,
        processName: activity.process.name,
        versionId: item.offering.activityVersion.id,
        versionNumber: item.offering.activityVersion.versionNumber,
        items: [item],
        projected,
        trained: item.facts?.trained ?? 0,
        executed: item.status === 'EXECUTED' ? 1 : 0,
      });
    }
  }
  for (const group of groups.values()) {
    group.items.sort((a, b) => a.plannedMonth - b.plannedMonth);
  }
  return [...groups.values()].sort((a, b) => a.activityName.localeCompare(b.activityName, 'es'));
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-[0.04em] text-ink-500">{label}</p>
      <p className="mt-1 font-display text-[28px] font-bold tabular-nums text-ink-900">{value}</p>
      <p className="mt-1 text-xs text-ink-500">{hint}</p>
    </div>
  );
}

export default function PlanDetallePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const { showToast } = useToast();
  /**
   * El ciclo de vida del plan NO es gestion: aprobar congela los proyectados y crea obligaciones
   * para toda la empresa, asi que exige `plans:approve`, que el Analista no tiene. Sin esto la
   * pantalla le ofrecia "Aprobar plan" y el servidor le contestaba 403 al pulsarlo.
   */
  const can = useCan();
  const canApprove = can('plans:approve');

  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [offerings, setOfferings] = useState<OfferingListItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<PlanView>('capacitacion');

  /** Cajon de crear la jornada desde el plan. `locked` = "otra jornada de esta misma". */
  const [newOpen, setNewOpen] = useState(false);
  const [locked, setLocked] = useState<{ id: string; label: string } | null>(null);
  const [defaultMonth, setDefaultMonth] = useState<number | undefined>(undefined);

  /**
   * FILTROS. Con 52 capacitaciones en un plan, una lista sin filtro no es una lista: es un muro.
   * Se filtra sobre lo ya cargado —el plan entero viene en una peticion— asi que responden al
   * instante y no hacen ir y volver al servidor por cada tecla.
   */
  const [fProcess, setFProcess] = useState('');
  const [fMonth, setFMonth] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [q, setQ] = useState('');

  /** Ajuste de proyectados: se abre desde la celda del renglon (Decision #56). */
  const [adjust, setAdjust] = useState<PlanItemRow | null>(null);
  const [adjustForm, setAdjustForm] = useState({ count: '', reason: '' });

  /** Camino secundario: enganchar una convocatoria que YA existe. */
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachForm, setAttachForm] = useState({
    offeringId: '',
    plannedMonth: String(new Date().getMonth() + 1),
    justification: '',
  });

  const load = useCallback(async () => {
    try {
      setPlan(await getPlan(id));
    } catch {
      showToast({ kind: 'danger', title: 'No se pudo cargar el plan' });
    }
  }, [id, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void listOfferings({ pageSize: 100 }).then((result) => setOfferings(result.items));
  }, []);

  const processes = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of plan?.items ?? []) {
      const process = item.offering.activityVersion.activity.process;
      map.set(process.id, process.name);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  }, [plan]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (plan?.items ?? []).filter((item) => {
      const activity = item.offering.activityVersion.activity;
      if (fProcess && activity.process.id !== fProcess) return false;
      if (fMonth && item.plannedMonth !== Number(fMonth)) return false;
      if (fStatus && item.status !== fStatus) return false;
      if (term && !`${activity.name} ${item.offering.code}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [plan, fProcess, fMonth, fStatus, q]);

  const groups = useMemo(() => groupByActivity(filtered), [filtered]);
  const filtering = Boolean(fProcess || fMonth || fStatus || q.trim());

  /**
   * REPROGRAMAR arrastrando en el cronograma. Se pinta antes de que conteste el servidor —mover
   * una ficha y esperar tres decimas a que se mueva se siente roto— y si falla se recarga el plan,
   * que devuelve la verdad.
   */
  const reschedule = async (item: PlanItemRow, month: number) => {
    setPlan((previous) =>
      previous
        ? {
            ...previous,
            items: previous.items.map((row) => (row.id === item.id ? { ...row, plannedMonth: month } : row)),
          }
        : previous,
    );
    try {
      await updatePlanItem(item.id, { plannedMonth: month });
      await load();
      showToast({
        kind: 'success',
        title: `Movida a ${monthName(month)}`,
        description: 'Queda como REPROGRAMADA: el indicador distingue lo que se movio.',
      });
    } catch (error) {
      await load();
      showToast({
        kind: 'danger',
        title:
          error instanceof ApiError && error.code === 'PLAN_ITEM_EXECUTED'
            ? 'Esa jornada ya se ejecuto: no se reprograma'
            : 'No se pudo reprogramar',
      });
    }
  };

  const openAdjust = (item: PlanItemRow) => {
    setAdjustForm({ count: String(item.projectedSnapshot ?? item.offering.projectedCount ?? ''), reason: '' });
    setAdjust(item);
  };

  const saveAdjust = async () => {
    if (!adjust) return;
    setBusy(true);
    try {
      const result = await adjustProjected(adjust.offering.id, {
        projectedCount: Number(adjustForm.count),
        reason: adjustForm.reason.trim(),
      });
      await load();
      setAdjust(null);
      // La pantalla dice cual de las dos cosas paso: quien no puede publicar no ajusto nada
      // todavia, lo PROPUSO. Decir "ajustado" ahi seria mentirle.
      showToast(
        result.executed
          ? { kind: 'success', title: 'Proyectados ajustados', description: 'El motivo queda en la auditoria del renglon.' }
          : { kind: 'info', title: 'Enviado a aprobacion', description: 'El administrador decide; el numero no cambia hasta entonces.' },
      );
    } catch (error) {
      showToast({ kind: 'danger', title: error instanceof ApiError ? error.message : 'No se pudo ajustar' });
    } finally {
      setBusy(false);
    }
  };

  const attach = async () => {
    setBusy(true);
    try {
      setPlan(
        await addPlanItem(id, {
          offeringId: attachForm.offeringId,
          plannedMonth: Number(attachForm.plannedMonth),
          justification: needsReason ? attachForm.justification.trim() : undefined,
        }),
      );
      showToast({ kind: 'success', title: 'Renglon agregado' });
      setAttachOpen(false);
    } catch (error) {
      showToast({
        kind: 'danger',
        title:
          error instanceof ApiError && error.code === 'OFFERING_ALREADY_IN_PLAN'
            ? 'Esa convocatoria ya esta en un plan'
            : 'No se pudo agregar el renglon',
      });
    } finally {
      setBusy(false);
    }
  };

  const removeItem = async (itemId: string) => {
    setBusy(true);
    try {
      await removePlanItem(itemId);
      await load();
      showToast({ kind: 'success', title: 'Renglon quitado' });
    } catch (error) {
      showToast({
        kind: 'danger',
        title:
          error instanceof ApiError && error.code === 'PLAN_ITEM_HAS_ASSIGNMENTS'
            ? 'El renglon ya genero obligaciones: cancelalo en vez de borrarlo'
            : 'No se pudo quitar el renglon',
      });
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    setBusy(true);
    try {
      const result = await approvePlan(id);
      showToast({
        kind: 'success',
        title: 'Plan aprobado',
        description: `Se congelaron los proyectados y nacieron ${result.assignments} obligaciones del plan.`,
      });
      await load();
    } catch (error) {
      showToast({
        kind: 'danger',
        title:
          error instanceof ApiError && error.code === 'PLAN_OFFERINGS_NOT_PUBLISHED'
            ? 'Publica primero las convocatorias del plan'
            : error instanceof ApiError && error.code === 'PLAN_EMPTY'
              ? 'Un plan sin renglones no se aprueba'
              : 'No se pudo aprobar el plan',
      });
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (next: 'ACTIVE' | 'CLOSED') => {
    setBusy(true);
    try {
      await (next === 'ACTIVE' ? activatePlan(id) : closePlan(id));
      showToast({ kind: 'success', title: next === 'ACTIVE' ? 'Plan en ejecucion' : 'Plan cerrado' });
      await load();
    } catch {
      showToast({ kind: 'danger', title: 'No se pudo cambiar el estado' });
    } finally {
      setBusy(false);
    }
  };

  if (!plan) return <Skeleton className="h-96 w-full" />;

  /**
   * Solo el BORRADOR se compone. Un plan aprobado NO se edita (Decision #40): sus renglones ya
   * obligan a personas reales, y agregarle cosas en silencio reescribiria el programa contra el
   * que se mide el cumplimiento.
   */
  const isDraft = plan.status === 'DRAFT';
  /**
   * AGREGAR y BORRAR dejaron de ser la misma pregunta (Decision #55).
   *
   * Borrar un renglon sigue siendo cosa del borrador: cuando el plan ya obliga a gente, quitarlo
   * reescribiria el pasado —lo que se hace entonces es CANCELAR, que deja rastro—. Agregar no
   * reescribe nada, y prohibirlo no evitaba el cambio: lo sacaba del sistema. Si el plan esta
   * vivo, se agrega con motivo; si esta cerrado, ya no se toca.
   */
  const canAdd = plan.status !== 'CLOSED';
  const needsReason = canAdd && !isDraft;
  const metrics = plan.metrics;

  /**
   * Abre el cajon. Con `group`, la capacitacion viene fija —es "otra jornada de esta misma"— y el
   * mes arranca en el de la ultima jornada, que es de donde se sigue contando.
   */
  const openNew = (group?: ActivityGroup) => {
    setLocked(group ? { id: group.versionId, label: `${group.activityName} (v${group.versionNumber})` } : null);
    setDefaultMonth(group ? group.items.at(-1)?.plannedMonth : undefined);
    setNewOpen(true);
  };

  return (
    <div>
      <Link href="/plan" className="focus-ring mb-4 inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft size={15} />
        Planes
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-[28px] font-semibold text-ink-900">{plan.name}</h1>
            <StatusPill kind={PLAN_STATUS[plan.status].kind} label={PLAN_STATUS[plan.status].label} />
          </div>
          <p className="mt-1 text-sm text-ink-500">
            Ano {plan.year}
            {plan.approvedAt ? ` · aprobado el ${formatDate(plan.approvedAt)}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canAdd ? (
            <>
              {/*
                CREAR LA CAPACITACION SIN SALIRSE DEL PLAN. No se puede resolver en un cajon: una
                capacitacion nueva hay que ARMARLA —contenido, evaluacion— y publicarla antes de
                poder convocarla. Lo que si se puede es que el plan te lleve y te traiga de vuelta:
                se va con `volverA` y la ficha de la actividad ofrece el regreso.
              */}
              <Button
                variant="outline"
                onClick={() => router.push(`/contenido-formativo?nueva=1&volverA=${encodeURIComponent(`/plan/${id}`)}`)}
              >
                <Sparkles size={16} />
                Capacitacion nueva
              </Button>
              <Button variant="outline" onClick={() => setAttachOpen(true)}>
                <Link2 size={16} />
                Usar una que ya existe
              </Button>
              <Button variant="outline" onClick={() => openNew()}>
                <Plus size={16} />
                Agregar al plan
              </Button>
            </>
          ) : null}
          {/*
            APROBAR es del borrador y solo del borrador. Al abrir "agregar" a los planes vivos
            (Decision #55) este boton se colo con ellos y aparecia sobre un plan YA APROBADO, que
            es ofrecer algo que el servidor rechaza.
          */}
          {isDraft && canApprove ? (
            <Button onClick={approve} loading={busy}>
              <CheckCircle2 size={16} />
              Aprobar plan
            </Button>
          ) : null}
          {plan.status === 'APPROVED' && canApprove ? (
            <Button onClick={() => changeStatus('ACTIVE')} loading={busy}>
              Marcar en ejecucion
            </Button>
          ) : null}
          {plan.status === 'ACTIVE' && canApprove ? (
            <Button variant="ghost" onClick={() => changeStatus('CLOSED')} loading={busy}>
              Cerrar el ano
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Cumplimiento del programa"
          value={`${metrics.compliancePct}%`}
          hint={`${metrics.executed} ejecutadas de ${metrics.programmed} programadas`}
        />
        <Stat label="Cobertura" value={`${metrics.coveragePct}%`} hint={`${metrics.trained} capacitados de ${metrics.projected} proyectados`} />
        <Stat label="Obligaciones del plan" value={metrics.assigned} hint="Solo las nacidas de este plan" />
        <Stat label="Inscritos" value={metrics.enrolled} hint="Obligaciones que llegaron a inscripcion" />
      </div>

      {plan.objective ? (
        <div className="card mb-6 p-5">
          <h2 className="font-display text-base font-semibold text-ink-900">Objetivo</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-ink-700">{plan.objective}</p>
        </div>
      ) : null}

      {/* Tres vistas del MISMO plan: no son tres pantallas, es una pregunta distinta cada vez. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex h-11 items-center gap-1 rounded-full bg-paper p-1">
          <ViewTab active={view} id="capacitacion" onSelect={setView} icon={Layers} label="Por capacitacion" />
          <ViewTab active={view} id="mes" onSelect={setView} icon={CalendarRange} label="Cronograma" />
          <ViewTab active={view} id="proceso" onSelect={setView} icon={ShieldCheck} label="Por proceso" />
          <ViewTab active={view} id="tabla" onSelect={setView} icon={Rows3} label="Tabla" />
        </div>
        <span className="text-sm text-ink-500">
          {groups.length} {groups.length === 1 ? 'capacitacion' : 'capacitaciones'} · {filtered.length}{' '}
          {filtered.length === 1 ? 'jornada' : 'jornadas'}
          {filtering ? ` de ${plan.items.length}` : ''}
        </span>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
          <Input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Buscar capacitacion o numero"
            className="w-[260px] pl-9"
            aria-label="Buscar en el plan"
          />
        </div>
        <Select value={fProcess} onChange={(event) => setFProcess(event.target.value)} aria-label="Filtrar por proceso" className="w-[210px]">
          <option value="">Todos los procesos</option>
          {processes.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </Select>
        <Select value={fMonth} onChange={(event) => setFMonth(event.target.value)} aria-label="Filtrar por mes" className="w-[150px]">
          <option value="">Todo el ano</option>
          {MONTHS.map((month, index) => (
            <option key={month} value={index + 1}>
              {month}
            </option>
          ))}
        </Select>
        <Select value={fStatus} onChange={(event) => setFStatus(event.target.value)} aria-label="Filtrar por estado" className="w-[170px]">
          <option value="">Todos los estados</option>
          {Object.entries(ITEM_STATUS).map(([value, meta]) => (
            <option key={value} value={value}>
              {meta.label}
            </option>
          ))}
        </Select>
        {filtering ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQ('');
              setFProcess('');
              setFMonth('');
              setFStatus('');
            }}
          >
            Quitar filtros
          </Button>
        ) : null}
      </div>

      {plan.items.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={ClipboardList}
            title="El plan todavia no tiene nada"
            description="Agrega la primera capacitacion del ano. Puedes crear la jornada aqui mismo, sin salir del plan."
            action={
              canAdd ? (
                <div className="flex flex-wrap justify-center gap-2">
                  <Button onClick={() => openNew()}>
                    <Plus size={16} />
                    Agregar al plan
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => router.push(`/contenido-formativo?nueva=1&volverA=${encodeURIComponent(`/plan/${id}`)}`)}
                  >
                    <Sparkles size={16} />
                    Capacitacion nueva
                  </Button>
                </div>
              ) : undefined
            }
          />
        </div>
      ) : view === 'capacitacion' ? (
        <div className="space-y-3">
          {groups.map((group) => (
            <ActivityCard
              key={group.activityId}
              group={group}
              canRemove={isDraft}
              canAdd={canAdd}
              busy={busy}
              onRemove={removeItem}
              onAddSession={() => openNew(group)}
              onAdjust={openAdjust}
            />
          ))}
        </div>
      ) : view === 'mes' ? (
        <MonthGrid groups={groups} canReschedule={plan.status !== 'CLOSED'} onReschedule={reschedule} />
      ) : view === 'tabla' ? (
        <FlatTable items={filtered} canRemove={isDraft} busy={busy} onRemove={removeItem} onAdjust={openAdjust} />
      ) : (
        <ProcessTable plan={plan} />
      )}

      {/* Camino principal: la jornada se crea AQUI y entra al plan de una. */}
      <NewOfferingDrawer
        open={newOpen}
        onOpenChange={setNewOpen}
        lockedVersion={locked}
        askPlanMonth
        defaultMonth={defaultMonth}
        askJustification={needsReason}
        onCreated={async (offering, plannedMonth, justification) => {
          await addPlanItem(id, {
            offeringId: offering.id,
            plannedMonth: plannedMonth ?? new Date().getMonth() + 1,
            justification,
          });
          await load();
          showToast({
            kind: 'success',
            title: 'Agregada al plan',
            description: needsReason
              ? 'Publicala para que congele sus proyectados y empiece a obligar.'
              : 'Queda en borrador: publicala para congelar sus proyectados.',
          });
        }}
      />

      {/* Ajustar el denominador de la cobertura. Nunca en linea: exige motivo (regla de oro 3). */}
      <Drawer
        open={adjust !== null}
        onOpenChange={(open) => !open && setAdjust(null)}
        title="Ajustar proyectados"
        description={
          adjust
            ? `${adjust.offering.activityVersion.activity.name} · ${adjust.offering.code}`
            : undefined
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAdjust(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void saveAdjust()}
              loading={busy}
              disabled={!adjustForm.count || adjustForm.reason.trim().length < 10}
            >
              Guardar ajuste
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="rounded-md bg-info-soft px-3 py-2 text-sm text-info">
            Los proyectados se congelan al publicar y son el denominador de la cobertura. Corregirlos a mano cambia el
            indicador, asi que el motivo es obligatorio y queda en la auditoria.
          </p>
          <Field htmlFor="pr-count" label="Proyectados" required>
            <Input
              id="pr-count"
              type="number"
              min={0}
              value={adjustForm.count}
              onChange={(event) => setAdjustForm({ ...adjustForm, count: event.target.value })}
            />
          </Field>
          <Field
            htmlFor="pr-reason"
            label="Motivo del ajuste"
            required
            hint="Ejemplo: ingresaron 7 conductores al area en marzo, despues de congelar."
          >
            <Textarea
              id="pr-reason"
              rows={3}
              value={adjustForm.reason}
              onChange={(event) => setAdjustForm({ ...adjustForm, reason: event.target.value })}
              placeholder="Minimo 10 caracteres"
            />
          </Field>
        </div>
      </Drawer>

      {/* Camino secundario: la jornada ya existia porque se creo desde Convocatorias. */}
      <Drawer
        open={attachOpen}
        onOpenChange={setAttachOpen}
        title="Usar una convocatoria que ya existe"
        description="El plan la referencia; no se apropia de la actividad."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAttachOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={attach}
              loading={busy}
              disabled={!attachForm.offeringId || (needsReason && attachForm.justification.trim().length < 10)}
            >
              Agregar
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field htmlFor="i-offering" label="Convocatoria" required>
            <Select id="i-offering" value={attachForm.offeringId} onChange={(event) => setAttachForm({ ...attachForm, offeringId: event.target.value })}>
              <option value="">Seleccionar...</option>
              {offerings
                .filter((offering) => offering.status !== 'CANCELLED')
                .map((offering) => (
                  <option key={offering.id} value={offering.id}>
                    {offering.code} · {offering.activityVersion.activity.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field htmlFor="i-month" label="Mes programado" required>
            <Select id="i-month" value={attachForm.plannedMonth} onChange={(event) => setAttachForm({ ...attachForm, plannedMonth: event.target.value })}>
              {MONTHS.map((month, index) => (
                <option key={month} value={index + 1}>
                  {month}
                </option>
              ))}
            </Select>
          </Field>

          {needsReason ? (
            <Field
              htmlFor="i-reason"
              label="Por que se agrega al plan aprobado"
              required
              hint="Queda en la auditoria junto al renglon. Ejemplo: se abrio la regional de Neiva en agosto."
            >
              <Textarea
                id="i-reason"
                rows={2}
                value={attachForm.justification}
                onChange={(event) => setAttachForm({ ...attachForm, justification: event.target.value })}
                placeholder="Minimo 10 caracteres"
              />
            </Field>
          ) : null}
        </div>
      </Drawer>
    </div>
  );
}

function ViewTab({
  id,
  active,
  onSelect,
  label,
  icon: Icon,
}: {
  id: PlanView;
  active: PlanView;
  onSelect: (id: PlanView) => void;
  label: string;
  icon: typeof Layers;
}) {
  const selected = active === id;
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      aria-pressed={selected}
      className={cn(
        'focus-ring flex h-9 items-center gap-2 rounded-full px-4 text-sm transition-all duration-150 ease-pulse',
        selected ? 'bg-surface font-medium text-ink-900 shadow-card' : 'text-ink-500 hover:text-ink-900',
      )}
    >
      <Icon size={15} strokeWidth={1.75} aria-hidden="true" />
      {label}
    </button>
  );
}

/**
 * UNA CAPACITACION DEL PLAN con sus jornadas dentro. Es la vista que faltaba: tres jornadas de la
 * misma reinduccion se leen como una cosa con tres fechas, y no como tres filas que se repiten.
 */
function ActivityCard({
  group,
  canRemove,
  canAdd,
  busy,
  onRemove,
  onAddSession,
  onAdjust,
}: {
  group: ActivityGroup;
  /** Quitar el renglon: solo en borrador. Despues se CANCELA, que deja rastro. */
  canRemove: boolean;
  /** Agregar otra jornada: tambien con el plan vivo, con motivo (Decision #55). */
  canAdd: boolean;
  busy: boolean;
  onRemove: (itemId: string) => void;
  onAddSession: () => void;
  onAdjust: (item: PlanItemRow) => void;
}) {
  const coverage = group.projected === 0 ? 0 : Math.round((group.trained / group.projected) * 100);

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h3 className="font-display text-base font-semibold text-ink-900">{group.activityName}</h3>
          <p className="mt-0.5 text-sm text-ink-500">
            {group.processName} · v{group.versionNumber} · {group.items.length}{' '}
            {group.items.length === 1 ? 'jornada' : 'jornadas'} · {group.projected} proyectados
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="font-display text-lg font-semibold tabular-nums text-ink-900">{coverage}%</p>
            <p className="text-xs text-ink-500">
              {group.trained} de {group.projected}
            </p>
          </div>
          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-line">
            <span
              className="block h-full rounded-full transition-[width] duration-[320ms] ease-pulse"
              style={{ width: `${coverage}%`, backgroundColor: 'var(--brand-accent)' }}
            />
          </span>
        </div>
      </div>

      <Table>
        <THead>
          <Tr>
            <Th className="w-28">Mes</Th>
            <Th>Donde</Th>
            <Th>Convocatoria</Th>
            <Th className="text-right">Proyectados</Th>
            <Th className="text-right">Capacitados</Th>
            <Th>Estado</Th>
            {canRemove ? <Th className="w-20 text-right">Accion</Th> : null}
          </Tr>
        </THead>
        <TBody>
          {group.items.map((item) => (
            <Tr key={item.id}>
              <Td className="text-ink-700">{monthName(item.plannedMonth)}</Td>
              <Td>
                <div className="text-ink-900">{item.offering.regional?.name ?? 'Todas las regionales'}</div>
                {item.offering.scheduledDate ? (
                  <div className="text-xs text-ink-500">{formatDate(item.offering.scheduledDate)}</div>
                ) : null}
              </Td>
              <Td>
                <Link href={`/convocatorias/${item.offering.id}`} className="focus-ring font-mono text-xs text-ink-700 hover:underline">
                  {item.offering.code}
                </Link>
              </Td>
              <Td className="text-right tabular-nums text-ink-700">
                <ProjectedCell item={item} onAdjust={onAdjust} />
              </Td>
              <Td className="text-right tabular-nums text-ink-700">{item.facts?.trained ?? 0}</Td>
              <Td>
                <StatusPill kind={ITEM_STATUS[item.status].kind} label={ITEM_STATUS[item.status].label} />
              </Td>
              {canRemove ? (
                <Td className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => onRemove(item.id)} disabled={busy}>
                    Quitar
                  </Button>
                </Td>
              ) : null}
            </Tr>
          ))}
        </TBody>
      </Table>

      {canAdd ? (
        <div className="border-t border-line px-5 py-3">
          <Button variant="ghost" size="sm" onClick={onAddSession}>
            <Plus size={15} />
            Otra jornada de esta capacitacion
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * EL ANO DE UN VISTAZO. Doce columnas y una fila por capacitacion: es el cuadro que la gente ya
 * dibuja en una hoja de calculo, y responde la pregunta que la tabla plana no contestaba nunca
 * —"¿que toca en marzo?"— sin leer renglon por renglon.
 */
/**
 * EL CRONOGRAMA: doce columnas, una fila por capacitacion, cada jornada en su mes.
 *
 * Es el Excel que ya tenian, y su valor esta en lo que el Excel no puede hacer. Antes cada celda
 * era un circulo con "2" dentro: decia cuantas jornadas hay y nada mas, asi que para saber cual
 * era o para moverla habia que irse a otra vista. Ahora cada jornada es su propia ficha —con la
 * regional escrita y el estado en el color— y se ARRASTRA de mes, que es la operacion que de
 * verdad ocurre a lo largo del ano.
 *
 * Mover no es cosmetico: el servidor lo marca REPROGRAMADA, y esa distincion es la que separa
 * "se cumplio en su mes" de "se movio hasta que cupo". Por eso lo ejecutado no se arrastra —ya es
 * historia— y en un plan cerrado no se arrastra nada.
 */
function MonthGrid({
  groups,
  canReschedule,
  onReschedule,
}: {
  groups: ActivityGroup[];
  canReschedule: boolean;
  onReschedule: (item: PlanItemRow, month: number) => void;
}) {
  const now = new Date().getMonth() + 1;
  const [dragging, setDragging] = useState<PlanItemRow | null>(null);
  const [over, setOver] = useState<string | null>(null);

  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[980px] border-collapse">
        <thead>
          <tr className="border-b border-line">
            <th className="sticky left-0 z-10 bg-surface px-5 py-3 text-left text-xs font-medium uppercase tracking-[0.04em] text-ink-500">
              Capacitacion
            </th>
            {MONTHS.map((month, index) => (
              <th
                key={month}
                className={cn(
                  'px-1 py-3 text-center text-xs font-medium uppercase text-ink-500',
                  index + 1 === now && 'text-ink-900',
                )}
              >
                {month.slice(0, 3)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <tr key={group.activityId} className="border-b border-line last:border-0">
              <td className="sticky left-0 z-10 max-w-[280px] bg-surface px-5 py-3">
                <p className="truncate text-sm font-medium text-ink-900">{group.activityName}</p>
                <p className="truncate text-xs text-ink-500">{group.processName}</p>
              </td>
              {MONTHS.map((month, index) => {
                const monthNumber = index + 1;
                const cellId = group.activityId + '-' + monthNumber;
                const inMonth = group.items.filter((item) => item.plannedMonth === monthNumber);
                // Solo se suelta en la fila de la MISMA capacitacion: arrastrar una jornada a la
                // fila de otra no seria moverla de mes, seria convertirla en otra cosa.
                const droppable =
                  canReschedule &&
                  dragging !== null &&
                  dragging.offering.activityVersion.activity.id === group.activityId;

                return (
                  <td
                    key={month}
                    onDragOver={(event) => {
                      if (!droppable) return;
                      event.preventDefault();
                      setOver(cellId);
                    }}
                    onDragLeave={() => setOver((previous) => (previous === cellId ? null : previous))}
                    onDrop={(event) => {
                      event.preventDefault();
                      setOver(null);
                      if (droppable && dragging && dragging.plannedMonth !== monthNumber) {
                        onReschedule(dragging, monthNumber);
                      }
                      setDragging(null);
                    }}
                    aria-label={month + ' · ' + group.activityName}
                    className={cn(
                      'px-1 py-2 align-top transition-colors duration-150',
                      monthNumber === now && 'bg-paper',
                      droppable && over !== cellId && 'bg-paper/60',
                      over === cellId && 'bg-primary-soft',
                    )}
                  >
                    <div className="flex flex-col items-center gap-1">
                      {inMonth.map((item) => (
                        <SessionChip
                          key={item.id}
                          item={item}
                          movable={canReschedule && item.status !== 'EXECUTED'}
                          onDragStart={() => setDragging(item)}
                          onDragEnd={() => {
                            setDragging(null);
                            setOver(null);
                          }}
                        />
                      ))}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-wrap items-center gap-4 border-t border-line px-5 py-3 text-xs text-ink-500">
        <Legend color="var(--brand-primary)" label="Programada" />
        <Legend color="var(--ok)" label="Ejecutada" />
        <Legend color="var(--warn)" label="Reprogramada" />
        <Legend color="var(--ink-300)" label="Cancelada" />
        <span>
          {canReschedule
            ? 'Arrastra una jornada a otro mes para reprogramarla.'
            : 'Un plan cerrado ya no se reprograma.'}
        </span>
      </div>
    </div>
  );
}

/** El color dice el estado sin leer nada: es lo unico que se ve de lejos en doce columnas. */
const CHIP_COLOR: Record<PlanItemStatus, string> = {
  PLANNED: 'var(--brand-primary)',
  EXECUTED: 'var(--ok)',
  RESCHEDULED: 'var(--warn)',
  CANCELLED: 'var(--ink-300)',
};

/**
 * UNA JORNADA dentro del cronograma.
 *
 * Lleva la regional escrita y no solo un color, porque el caso que hace util esta vista es la
 * reinduccion en tres sedes: tres puntos identicos no se distinguen y "Bogota / Medellin /
 * Barranquilla" si. El resto —codigo, fecha, proyectados, capacitados— aparece al pasar por
 * encima o al enfocar con el teclado, para no convertir doce columnas en un muro de texto.
 */
function SessionChip({
  item,
  movable,
  onDragStart,
  onDragEnd,
}: {
  item: PlanItemRow;
  movable: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const [open, setOpen] = useState(false);
  const projected = item.projectedSnapshot ?? item.offering.projectedCount;
  const place = item.offering.regional?.name ?? 'Todas';

  return (
    <span className="relative">
      <Link
        href={`/convocatorias/${item.offering.id}`}
        draggable={movable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        title={movable ? 'Arrastrala a otro mes para reprogramarla' : undefined}
        className={cn(
          'focus-ring block max-w-[92px] truncate rounded-full px-2 py-1 text-[11px] font-medium text-white transition-transform duration-150',
          movable ? 'cursor-grab active:cursor-grabbing hover:scale-[1.04]' : 'cursor-pointer',
        )}
        style={{ backgroundColor: CHIP_COLOR[item.status] }}
      >
        {place}
      </Link>

      {open ? (
        <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 block w-52 -translate-x-1/2 rounded-lg border border-line bg-surface p-3 text-left shadow-lg">
          <span className="block font-mono text-[11px] text-ink-500">{item.offering.code}</span>
          <span className="mt-0.5 block text-xs font-medium text-ink-900">{place}</span>
          {item.offering.scheduledDate ? (
            <span className="mt-0.5 block text-xs text-ink-500">{formatDate(item.offering.scheduledDate)}</span>
          ) : null}
          <span className="mt-1.5 block text-xs text-ink-700">
            {item.facts?.trained ?? 0} de {projected ?? '—'} capacitados
          </span>
          <span className="mt-1.5 block">
            <StatusPill kind={ITEM_STATUS[item.status].kind} label={ITEM_STATUS[item.status].label} />
          </span>
        </span>
      ) : null}
    </span>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
      {label}
    </span>
  );
}

function ProcessTable({ plan }: { plan: PlanDetail }) {
  if (plan.byProcess.length === 0) {
    return (
      <div className="card">
        <EmptyState icon={ShieldCheck} title="Todavia no hay nada por proceso" description="Aparece cuando el plan tenga renglones." />
      </div>
    );
  }
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4">
        <h2 className="font-display text-base font-semibold text-ink-900">Por proceso</h2>
        <p className="mt-1 text-sm text-ink-500">
          El plan SST, el PESV y el BASC son vistas del mismo plan: cada auditor mira su parte.
        </p>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <THead>
            <Tr>
              <Th>Proceso</Th>
              <Th className="text-right">Programadas</Th>
              <Th className="text-right">Ejecutadas</Th>
              <Th className="text-right">Cumplimiento</Th>
              <Th className="text-right">Cobertura</Th>
            </Tr>
          </THead>
          <TBody>
            {plan.byProcess.map((group) => (
              <Tr key={group.process.id}>
                <Td className="font-medium text-ink-900">{group.process.name}</Td>
                <Td className="text-right tabular-nums text-ink-700">{group.metrics.programmed}</Td>
                <Td className="text-right tabular-nums text-ink-700">{group.metrics.executed}</Td>
                <Td className="text-right tabular-nums text-ink-700">{group.metrics.compliancePct}%</Td>
                <Td className="text-right tabular-nums text-ink-700">{group.metrics.coveragePct}%</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </div>
    </div>
  );
}

/**
 * LA TABLA PLANA, que no desaparece: es la vista de buscar, ordenar y exportar.
 *
 * Agrupar por capacitacion contesta "que se dicta este ano"; la tabla contesta "donde esta ESTE
 * renglon". Son dos preguntas distintas y por eso conviven en vez de sustituirse.
 */
function FlatTable({
  items,
  canRemove,
  busy,
  onRemove,
  onAdjust,
}: {
  items: PlanItemRow[];
  canRemove: boolean;
  busy: boolean;
  onRemove: (itemId: string) => void;
  onAdjust: (item: PlanItemRow) => void;
}) {
  const sorted = [...items].sort((a, b) => a.plannedMonth - b.plannedMonth);

  if (sorted.length === 0) {
    return (
      <div className="card">
        <EmptyState icon={Search} title="Nada con esos filtros" description="Prueba con otro proceso, otro mes u otro estado." />
      </div>
    );
  }

  return (
    <div className="card overflow-x-auto">
      <Table>
        <THead>
          <Tr>
            <Th className="w-24">Mes</Th>
            <Th>Capacitacion</Th>
            <Th>Proceso</Th>
            <Th>Donde</Th>
            <Th>Convocatoria</Th>
            <Th className="text-right">Proyectados</Th>
            <Th className="text-right">Capacitados</Th>
            <Th>Estado</Th>
            {canRemove ? <Th className="w-20 text-right">Accion</Th> : null}
          </Tr>
        </THead>
        <TBody>
          {sorted.map((item) => (
            <Tr key={item.id}>
              <Td className="text-ink-700">{monthName(item.plannedMonth)}</Td>
              <Td className="font-medium text-ink-900">{item.offering.activityVersion.activity.name}</Td>
              <Td className="text-ink-500">{item.offering.activityVersion.activity.process.name}</Td>
              <Td className="text-ink-700">{item.offering.regional?.name ?? 'Todas'}</Td>
              <Td>
                <Link href={`/convocatorias/${item.offering.id}`} className="focus-ring font-mono text-xs text-ink-700 hover:underline">
                  {item.offering.code}
                </Link>
              </Td>
              <Td className="text-right tabular-nums text-ink-700">
                <ProjectedCell item={item} onAdjust={onAdjust} />
              </Td>
              <Td className="text-right tabular-nums text-ink-700">{item.facts?.trained ?? 0}</Td>
              <Td>
                <StatusPill kind={ITEM_STATUS[item.status].kind} label={ITEM_STATUS[item.status].label} />
              </Td>
              {canRemove ? (
                <Td className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => onRemove(item.id)} disabled={busy}>
                    Quitar
                  </Button>
                </Td>
              ) : null}
            </Tr>
          ))}
        </TBody>
      </Table>
    </div>
  );
}

/**
 * LOS PROYECTADOS, que dejan de ser texto muerto.
 *
 * Es el DENOMINADOR de la cobertura, y hasta ahora solo se podia tocar al publicar la
 * convocatoria. Pero el caso que pasa siempre es posterior: se congelaron 45 y entraron siete
 * personas al area en marzo. La regla de oro 3 ya preveia la valvula —"ajuste manual solo con
 * justificacion auditada"—; lo que faltaba era la puerta.
 *
 * Sin congelar todavia no se ofrece: ahi el numero aun se deriva solo y tocarlo a mano seria
 * inventarse un dato que el sistema va a recalcular al publicar.
 */
function ProjectedCell({ item, onAdjust }: { item: PlanItemRow; onAdjust: (item: PlanItemRow) => void }) {
  const value = item.projectedSnapshot ?? item.offering.projectedCount;
  const frozen = item.offering.status !== 'DRAFT' && value !== null && value !== undefined;

  if (!frozen) return <span className="text-ink-500">{value ?? '—'}</span>;
  return (
    <button
      type="button"
      onClick={() => onAdjust(item)}
      title="Ajustar los proyectados (pide motivo)"
      className="focus-ring rounded px-1.5 py-0.5 tabular-nums decoration-dotted underline-offset-4 hover:bg-paper hover:underline"
    >
      {value}
    </button>
  );
}
