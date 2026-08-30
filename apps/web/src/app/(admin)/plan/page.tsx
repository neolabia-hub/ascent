'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ClipboardList, Plus, Trash2 } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { createPlan, deletePlan, listPlans, type PlanRow, type PlanStatus } from '@/lib/delivery-api';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill, type StatusPillKind } from '@/components/ui/status-pill';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { useCan } from '@/components/providers/session-provider';

const STATUS: Record<PlanStatus, { kind: StatusPillKind; label: string }> = {
  DRAFT: { kind: 'neutral', label: 'BORRADOR' },
  APPROVED: { kind: 'info', label: 'APROBADO' },
  ACTIVE: { kind: 'ok', label: 'EN EJECUCION' },
  CLOSED: { kind: 'neutral', label: 'CERRADO' },
};

export default function PlanPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [plans, setPlans] = useState<PlanRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ year: String(new Date().getFullYear()), name: '', objective: '' });
  /**
   * Borrar desde el LISTADO y no solo desde la ficha: los planes que estorban son los de prueba,
   * y son varios. Obligar a entrar en cada uno para tirarlo es la friccion que hizo que nadie los
   * limpiara nunca.
   */
  const can = useCan();
  const canDelete = can('plans:approve');
  const [target, setTarget] = useState<PlanRow | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    try {
      setPlans(await listPlans());
    } catch {
      showToast({ kind: 'danger', title: 'No se pudieron cargar los planes' });
    }
  }, [showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setBusy(true);
    try {
      const plan = await createPlan({
        year: Number(form.year),
        name: form.name.trim(),
        objective: form.objective.trim() || null,
      });
      showToast({ kind: 'success', title: 'Plan creado', description: 'Agrega los renglones y despues apruebalo.' });
      router.push(`/plan/${plan.id}`);
    } catch {
      showToast({
        kind: 'danger',
        title: 'No se pudo crear el plan',
        description: 'Puede que ya exista uno con ese nombre para el ano.',
      });
    } finally {
      setBusy(false);
    }
  };

  const destroy = async () => {
    if (!target) return;
    setBusy(true);
    try {
      const result = await deletePlan(target.id, reason.trim() ? { justification: reason.trim() } : {});
      showToast({
        kind: 'success',
        title: 'Plan eliminado',
        description:
          result.revokedAssignments > 0 ? `Se revocaron ${result.revokedAssignments} obligaciones suyas.` : undefined,
      });
      setTarget(null);
      await load();
    } catch (error) {
      // El servidor explica POR QUE no se puede ("ya hay N personas que empezaron"): esa frase es
      // la respuesta, no un error tecnico que haya que traducir a "algo salio mal".
      showToast({
        kind: 'danger',
        title: error instanceof ApiError && error.message ? error.message : 'No se pudo eliminar el plan',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-semibold text-ink-900">Plan de capacitacion</h1>
          <p className="mt-1 text-sm text-ink-500">
            El programa anual con sus metas e indicadores. Al aprobarlo se congelan los proyectados y nacen sus obligaciones.
          </p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus size={16} />
          Nuevo plan
        </Button>
      </div>

      {!plans ? (
        <Skeleton className="h-80 w-full" />
      ) : plans.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={ClipboardList}
            title="Sin planes todavia"
            description="Crea el plan del ano: sus renglones referencian convocatorias y de ahi salen el cumplimiento y la cobertura."
            action={
              <Button onClick={() => setOpen(true)}>
                <Plus size={16} />
                Nuevo plan
              </Button>
            }
          />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <Tr>
                  <Th>Plan</Th>
                  <Th>Ano</Th>
                  <Th className="text-right">Renglones</Th>
                  <Th>Aprobado</Th>
                  <Th>Estado</Th>
                  <Th className="w-40 text-right">Accion</Th>
                </Tr>
              </THead>
              <TBody>
                {plans.map((plan) => (
                  <Tr key={plan.id}>
                    <Td className="font-medium text-ink-900">{plan.name}</Td>
                    <Td className="tabular-nums text-ink-700">{plan.year}</Td>
                    <Td className="text-right tabular-nums text-ink-700">{plan.itemCount}</Td>
                    <Td className="text-ink-500">{formatDate(plan.approvedAt)}</Td>
                    <Td>
                      <StatusPill kind={STATUS[plan.status].kind} label={STATUS[plan.status].label} />
                    </Td>
                    <Td className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link href={`/plan/${plan.id}`}>
                          <Button variant="ghost" size="sm">
                            Abrir
                          </Button>
                        </Link>
                        {/* El plan CERRADO no ofrece borrar: cerrarlo es lo que lo hizo evidencia. */}
                        {canDelete && plan.status !== 'CLOSED' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-danger"
                            aria-label={`Eliminar ${plan.name}`}
                            onClick={() => {
                              setReason('');
                              setTarget(plan);
                            }}
                          >
                            <Trash2 size={15} />
                          </Button>
                        ) : null}
                      </div>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
        </div>
      )}

      <Drawer
        open={target !== null}
        onOpenChange={(next) => (next ? null : setTarget(null))}
        title={target ? `Eliminar "${target.name}"` : 'Eliminar el plan'}
        description="Desaparece el plan con todos sus renglones. Las capacitaciones y convocatorias que referencia NO se tocan."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setTarget(null)}>
              Cancelar
            </Button>
            <Button
              onClick={destroy}
              loading={busy}
              disabled={target !== null && target.status !== 'DRAFT' && reason.trim().length < 10}
            >
              <Trash2 size={16} />
              Eliminar el plan
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {target && target.status !== 'DRAFT' ? (
            <>
              <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
                Este plan ya fue aprobado: si creo obligaciones, se revocan y desaparecen de la bandeja de esas personas.
                Si alguna ya empezo su formacion, no se podra borrar — ese avance es suyo.
              </p>
              <Field
                htmlFor="d-reason"
                label="Por que se elimina"
                required
                hint="Queda en la auditoria: hubo gente a la que ya se le anuncio esta formacion."
              >
                <Textarea
                  id="d-reason"
                  rows={2}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Minimo 10 caracteres"
                />
              </Field>
            </>
          ) : (
            <p className="text-sm text-ink-700">Esta en borrador: nunca obligo a nadie, asi que se borra sin consecuencias.</p>
          )}
        </div>
      </Drawer>

      <Drawer
        open={open}
        onOpenChange={setOpen}
        title="Nuevo plan de capacitacion"
        description="Queda en borrador: puedes armar sus renglones antes de aprobarlo."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={create} loading={busy} disabled={form.name.trim().length < 3}>
              Crear plan
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field htmlFor="p-year" label="Ano" required>
            <Input
              id="p-year"
              type="number"
              min={2000}
              max={2100}
              value={form.year}
              onChange={(event) => setForm({ ...form, year: event.target.value })}
            />
          </Field>
          <Field htmlFor="p-name" label="Nombre" required>
            <Input
              id="p-name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              placeholder="Plan anual de capacitacion"
              maxLength={160}
            />
          </Field>
          <Field htmlFor="p-objective" label="Objetivo">
            <textarea
              id="p-objective"
              value={form.objective}
              onChange={(event) => setForm({ ...form, objective: event.target.value })}
              rows={3}
              maxLength={4000}
              className="focus-ring block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink-900"
            />
          </Field>
        </div>
      </Drawer>
    </div>
  );
}
