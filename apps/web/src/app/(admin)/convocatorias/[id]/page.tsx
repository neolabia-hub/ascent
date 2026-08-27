'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, CheckCircle2, Send, UserPlus, Users, XCircle } from 'lucide-react';
import { ApiError } from '@/lib/api';
import {
  cancelOffering,
  completeOffering,
  enrollOffering,
  getOffering,
  getRoster,
  publishOffering,
  type OfferingDetail,
  type OfferingStatus,
  type RosterRow,
} from '@/lib/delivery-api';
import { formatDate } from '@/lib/format';
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

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-[0.04em] text-ink-500">{label}</p>
      <p className="mt-1 font-display text-[28px] font-bold tabular-nums text-ink-900">{value}</p>
      {hint ? <p className="mt-1 text-xs text-ink-500">{hint}</p> : null}
    </div>
  );
}

export default function ConvocatoriaDetallePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { showToast } = useToast();

  const [offering, setOffering] = useState<OfferingDetail | null>(null);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [busy, setBusy] = useState(false);

  const [publishOpen, setPublishOpen] = useState(false);
  const [override, setOverride] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const load = useCallback(async () => {
    try {
      const [detail, rosterResult] = await Promise.all([getOffering(id), getRoster(id)]);
      setOffering(detail);
      setRoster(rosterResult.items);
    } catch {
      showToast({ kind: 'danger', title: 'No se pudo cargar la convocatoria' });
    }
  }, [id, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const publish = async () => {
    setBusy(true);
    try {
      const result = await publishOffering(id, {
        projectedOverride: override ? Number(override) : undefined,
        projectedAdjustReason: override ? adjustReason : undefined,
      });
      showToast(
        result.executed
          ? { kind: 'success', title: 'Convocatoria publicada', description: 'Los proyectados quedaron congelados.' }
          : { kind: 'info', title: 'Enviada a aprobacion', description: 'Un administrador debe autorizar la publicacion.' },
      );
      setPublishOpen(false);
      setOverride('');
      setAdjustReason('');
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

  const enrollObliged = async () => {
    setBusy(true);
    try {
      const result = await enrollOffering(id, { allAssigned: true });
      showToast({
        kind: result.enrolled > 0 ? 'success' : 'info',
        title: result.enrolled > 0 ? `${result.enrolled} personas inscritas` : 'No habia obligados sin inscribir',
        description: result.skipped > 0 ? `${result.skipped} ya estaban inscritas.` : undefined,
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

  return (
    <div>
      <Link href="/convocatorias" className="focus-ring mb-4 inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft size={15} />
        Convocatorias
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-[28px] font-semibold text-ink-900">{activity.name}</h1>
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
          {isOpen ? (
            <>
              <Button variant="ghost" onClick={enrollObliged} loading={busy}>
                <UserPlus size={16} />
                Inscribir a los obligados
              </Button>
              <Button onClick={complete} loading={busy}>
                <CheckCircle2 size={16} />
                Cerrar convocatoria
              </Button>
            </>
          ) : null}
          {offering.status !== 'CANCELLED' && offering.status !== 'COMPLETED' ? (
            <Button variant="ghost" onClick={() => setCancelOpen(true)}>
              <XCircle size={16} />
              Cancelar
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Proyectados"
          value={offering.projectedCount ?? '—'}
          hint={offering.projectedFrozenAt ? `Congelados el ${formatDate(offering.projectedFrozenAt)}` : offering.derivedProjected.detail}
        />
        <Stat label="Inscritos" value={offering._count.enrollments} hint="Personas con ejecucion abierta" />
        <Stat label="Obligados a esta actividad" value={offering.obligedCount} hint="En toda la empresa, sin importar la sede" />
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

        <div className="card p-5">
          <h2 className="font-display text-base font-semibold text-ink-900">En el plan anual</h2>
          {offering.planItems.length === 0 ? (
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
                      <StatusPill kind={row.completedAt ? 'ok' : 'neutral'} label={row.completedAt ? 'COMPLETADA' : 'INSCRITO'} />
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </div>

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
            <Button onClick={publish} loading={busy} disabled={Boolean(override) && adjustReason.trim().length < 10}>
              Publicar
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="rounded-md bg-info-soft px-3 py-2 text-sm text-info">
            Proyectados derivados: <strong>{offering.derivedProjected.count}</strong>. {offering.derivedProjected.detail}
          </div>
          <Field htmlFor="p-override" label="Ajustar proyectados" hint="Dejalo vacio para usar el numero derivado.">
            <Input id="p-override" type="number" min={0} value={override} onChange={(event) => setOverride(event.target.value)} />
          </Field>
          {override ? (
            <Field htmlFor="p-reason" label="Justificacion del ajuste" required hint="Queda en la auditoria y visible en la convocatoria.">
              <Input id="p-reason" value={adjustReason} onChange={(event) => setAdjustReason(event.target.value)} maxLength={500} />
            </Field>
          ) : null}
        </div>
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
