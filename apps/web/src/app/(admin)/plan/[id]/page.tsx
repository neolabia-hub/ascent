'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, ClipboardList, Plus } from 'lucide-react';
import { ApiError } from '@/lib/api';
import {
  activatePlan,
  addPlanItem,
  approvePlan,
  closePlan,
  getPlan,
  listOfferings,
  removePlanItem,
  type OfferingListItem,
  type PlanDetail,
  type PlanItemStatus,
  type PlanStatus,
} from '@/lib/delivery-api';
import { formatDate, monthName, MONTHS } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill, type StatusPillKind } from '@/components/ui/status-pill';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';

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
  const id = params.id;
  const { showToast } = useToast();

  const [plan, setPlan] = useState<PlanDetail | null>(null);
  const [offerings, setOfferings] = useState<OfferingListItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [itemOpen, setItemOpen] = useState(false);
  const [itemForm, setItemForm] = useState({ offeringId: '', plannedMonth: String(new Date().getMonth() + 1) });

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

  const addItem = async () => {
    setBusy(true);
    try {
      setPlan(await addPlanItem(id, { offeringId: itemForm.offeringId, plannedMonth: Number(itemForm.plannedMonth) }));
      showToast({ kind: 'success', title: 'Renglon agregado' });
      setItemOpen(false);
    } catch (error) {
      showToast({
        kind: 'danger',
        title:
          error instanceof ApiError && error.code === 'PLAN_ITEM_DUPLICATED'
            ? 'Esa convocatoria ya esta en el plan'
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
    } catch (error) {
      showToast({
        kind: 'danger',
        title:
          error instanceof ApiError && error.code === 'PLAN_ITEM_IN_USE'
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

  const isDraft = plan.status === 'DRAFT';
  const metrics = plan.metrics;

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
          {isDraft ? (
            <>
              <Button variant="ghost" onClick={() => setItemOpen(true)}>
                <Plus size={16} />
                Agregar convocatoria
              </Button>
              <Button onClick={approve} loading={busy}>
                <CheckCircle2 size={16} />
                Aprobar plan
              </Button>
            </>
          ) : null}
          {plan.status === 'APPROVED' ? (
            <Button onClick={() => changeStatus('ACTIVE')} loading={busy}>
              Marcar en ejecucion
            </Button>
          ) : null}
          {plan.status === 'ACTIVE' ? (
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

      <div className="card mb-6 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <h2 className="font-display text-base font-semibold text-ink-900">Renglones del plan</h2>
            <p className="mt-1 text-sm text-ink-500">
              Cada renglon referencia una convocatoria. Reprogramarla no reescribe el plan: queda como reprogramada.
            </p>
          </div>
          <span className="text-sm text-ink-500">{plan.items.length} renglones</span>
        </div>

        {plan.items.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="El plan no tiene renglones"
            description="Agrega las convocatorias que componen el programa del ano."
            action={
              isDraft ? (
                <Button onClick={() => setItemOpen(true)}>
                  <Plus size={16} />
                  Agregar convocatoria
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <Tr>
                  <Th>Mes</Th>
                  <Th>Actividad</Th>
                  <Th>Proceso</Th>
                  <Th>Convocatoria</Th>
                  <Th className="text-right">Proyectados</Th>
                  <Th className="text-right">Capacitados</Th>
                  <Th>Estado</Th>
                  {isDraft ? <Th className="w-20 text-right">Accion</Th> : null}
                </Tr>
              </THead>
              <TBody>
                {plan.items.map((item) => (
                  <Tr key={item.id}>
                    <Td className="text-ink-700">{monthName(item.plannedMonth)}</Td>
                    <Td>
                      <div className="font-medium text-ink-900">{item.offering.activityVersion.activity.name}</div>
                      <div className="text-xs text-ink-500">{item.offering.regional?.name ?? 'Todas las regionales'}</div>
                    </Td>
                    <Td className="text-ink-500">{item.offering.activityVersion.activity.process.name}</Td>
                    <Td>
                      <Link href={`/convocatorias/${item.offering.id}`} className="focus-ring font-mono text-xs text-ink-700 hover:underline">
                        {item.offering.code}
                      </Link>
                    </Td>
                    <Td className="text-right tabular-nums text-ink-700">{item.projectedSnapshot ?? item.offering.projectedCount ?? '—'}</Td>
                    <Td className="text-right tabular-nums text-ink-700">{item.facts?.trained ?? 0}</Td>
                    <Td>
                      <StatusPill kind={ITEM_STATUS[item.status].kind} label={ITEM_STATUS[item.status].label} />
                    </Td>
                    {isDraft ? (
                      <Td className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => void removeItem(item.id)} disabled={busy}>
                          Quitar
                        </Button>
                      </Td>
                    ) : null}
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </div>

      {plan.byProcess.length > 0 ? (
        <div className="card overflow-hidden">
          <div className="px-5 py-4">
            <h2 className="font-display text-base font-semibold text-ink-900">Por sistema de gestion</h2>
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
      ) : null}

      <Drawer
        open={itemOpen}
        onOpenChange={setItemOpen}
        title="Agregar convocatoria al plan"
        description="El plan referencia la convocatoria; no se apropia de la actividad."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setItemOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={addItem} loading={busy} disabled={!itemForm.offeringId}>
              Agregar
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field htmlFor="i-offering" label="Convocatoria" required>
            <Select id="i-offering" value={itemForm.offeringId} onChange={(event) => setItemForm({ ...itemForm, offeringId: event.target.value })}>
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
            <Select id="i-month" value={itemForm.plannedMonth} onChange={(event) => setItemForm({ ...itemForm, plannedMonth: event.target.value })}>
              {MONTHS.map((month, index) => (
                <option key={month} value={index + 1}>
                  {month}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Drawer>
    </div>
  );
}
