'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckSquare } from 'lucide-react';
import { decideApproval, listApprovals, listMyApprovals, type ApprovalRow, type ApprovalsPage } from '@/lib/admin-api';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill, type StatusPillKind } from '@/components/ui/status-pill';
import { Table, TablePagination, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/components/ui/cn';
import { motivoDelError } from '@/lib/api';

type Tab = 'PENDING' | 'HISTORY' | 'MINE';

const ACTION_LABELS: Record<string, string> = {
  PUBLISH: 'Publicar',
  EDIT_PUBLISHED: 'Editar publicado',
  CANCEL_OFFERING: 'Cancelar convocatoria',
  OTHER: 'Otro cambio',
};

const STATUS_PILL: Record<ApprovalRow['status'], { kind: StatusPillKind; label: string }> = {
  PENDING: { kind: 'warn', label: 'PENDIENTE' },
  APPROVED: { kind: 'ok', label: 'APROBADA' },
  REJECTED: { kind: 'danger', label: 'RECHAZADA' },
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Bandeja de aprobaciones (negocio 3.3): el Analista solicita con justificacion obligatoria y el
 * Admin decide. Al aprobar, la API aplica el cambio; ambos reciben notificacion.
 */
export default function AprobacionesPage() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<Tab>('PENDING');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ApprovalsPage | null>(null);
  const [selected, setSelected] = useState<ApprovalRow | null>(null);
  const [note, setNote] = useState('');
  const [deciding, setDeciding] = useState(false);
  const [canDecide, setCanDecide] = useState(true);

  const load = useCallback(async () => {
    setData(null);
    try {
      if (tab === 'MINE') {
        setData(await listMyApprovals(page));
        return;
      }
      setData(await listApprovals(tab === 'PENDING' ? 'PENDING' : undefined, page));
    } catch {
      // Sin permiso approvals:decide solo se ve la pestana "Mis solicitudes".
      setCanDecide(false);
      setTab('MINE');
      setData(await listMyApprovals(page).catch(() => null));
    }
  }, [tab, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (decision: 'APPROVED' | 'REJECTED') => {
    if (!selected) return;
    setDeciding(true);
    try {
      await decideApproval(selected.id, decision, note || undefined);
      showToast({
        kind: decision === 'APPROVED' ? 'success' : 'info',
        title: decision === 'APPROVED' ? 'Solicitud aprobada' : 'Solicitud rechazada',
        description: 'Se notifico a quien la solicito.',
      });
      setSelected(null);
      setNote('');
      await load();
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo registrar la decision', description: motivoDelError(error) });
    } finally {
      setDeciding(false);
    }
  };

  const tabs: Array<{ key: Tab; label: string }> = canDecide
    ? [
        { key: 'PENDING', label: 'Pendientes' },
        { key: 'HISTORY', label: 'Historial' },
        { key: 'MINE', label: 'Mis solicitudes' },
      ]
    : [{ key: 'MINE', label: 'Mis solicitudes' }];

  const from = data ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = data ? Math.min(data.page * data.pageSize, data.total) : 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-display text-[28px] font-semibold text-ink-900">Aprobaciones</h1>
        <p className="mt-1 text-sm text-ink-500">
          Cambios sobre contenido publicado que requieren visto bueno. Toda solicitud lleva justificacion y queda auditada.
        </p>
      </div>

      <div className="mb-4 flex gap-1 border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => { setTab(t.key); setPage(1); }}
            className={cn(
              'focus-ring -mb-px border-b-2 px-4 py-2 text-sm transition-colors duration-150',
              tab === t.key ? 'border-[var(--brand-primary)] font-medium text-ink-900' : 'border-transparent text-ink-500 hover:text-ink-700',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!data ? (
        <Skeleton className="h-80 w-full" />
      ) : data.total === 0 ? (
        <div className="card">
          <EmptyState
            icon={CheckSquare}
            title={tab === 'PENDING' ? 'Sin solicitudes pendientes' : 'Sin solicitudes'}
            description={
              tab === 'PENDING'
                ? 'Cuando un analista proponga un cambio sobre contenido publicado, aparecera aqui.'
                : 'Todavia no hay solicitudes registradas en esta vista.'
            }
          />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <Tr>
                  <Th>Solicitud</Th>
                  <Th>Solicitada por</Th>
                  <Th>Fecha</Th>
                  <Th>Estado</Th>
                  <Th className="w-28 text-right">Accion</Th>
                </Tr>
              </THead>
              <TBody>
                {data.items.map((row) => (
                  <Tr key={row.id}>
                    <Td>
                      <div className="font-medium text-ink-900">{ACTION_LABELS[row.action] ?? row.action}</div>
                      <div className="text-xs text-ink-500">{row.entityType}</div>
                    </Td>
                    <Td className="text-ink-700">{row.requestedByName ?? '—'}</Td>
                    <Td className="text-ink-500">{formatDate(row.createdAt)}</Td>
                    <Td>
                      <StatusPill kind={STATUS_PILL[row.status].kind} label={STATUS_PILL[row.status].label} />
                    </Td>
                    <Td className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => { setSelected(row); setNote(''); }}>
                        {row.status === 'PENDING' && canDecide && tab !== 'MINE' ? 'Revisar' : 'Ver'}
                      </Button>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
          <TablePagination
            from={from}
            to={to}
            total={data.total}
            canPrevious={page > 1}
            canNext={to < data.total}
            onPrevious={() => setPage((p) => Math.max(1, p - 1))}
            onNext={() => setPage((p) => p + 1)}
          />
        </div>
      )}

      <Drawer
        open={selected !== null}
        onOpenChange={(open) => { if (!open) { setSelected(null); setNote(''); } }}
        title="Detalle de la solicitud"
        description={selected ? `${ACTION_LABELS[selected.action] ?? selected.action} sobre ${selected.entityType}` : undefined}
        footer={
          selected && selected.status === 'PENDING' && canDecide && tab !== 'MINE' ? (
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => decide('REJECTED')} loading={deciding}>
                Rechazar
              </Button>
              <Button onClick={() => decide('APPROVED')} loading={deciding}>
                Aprobar y aplicar
              </Button>
            </div>
          ) : (
            <div className="flex justify-end">
              <Button variant="ghost" onClick={() => setSelected(null)}>Cerrar</Button>
            </div>
          )
        }
      >
        {selected ? (
          <div className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-ink-300">Estado</p>
              <div className="mt-1">
                <StatusPill kind={STATUS_PILL[selected.status].kind} label={STATUS_PILL[selected.status].label} />
              </div>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wide text-ink-300">Justificacion</p>
              <p className="mt-1 rounded-md bg-paper px-3 py-2 text-sm text-ink-700">{selected.justification}</p>
            </div>

            <div>
              <p className="text-xs uppercase tracking-wide text-ink-300">Cambio propuesto</p>
              <pre className="mt-1 max-h-56 overflow-auto rounded-md bg-paper p-3 font-mono text-xs text-ink-700">
                {JSON.stringify(selected.payload, null, 2)}
              </pre>
            </div>

            {selected.status !== 'PENDING' ? (
              <div>
                <p className="text-xs uppercase tracking-wide text-ink-300">Decision</p>
                <p className="mt-1 text-sm text-ink-700">
                  {selected.decidedByName ?? 'Sistema'}
                  {selected.decidedAt ? ` — ${formatDate(selected.decidedAt)}` : ''}
                </p>
                {selected.decisionNote ? <p className="mt-1 text-sm text-ink-500">{selected.decisionNote}</p> : null}
              </div>
            ) : canDecide && tab !== 'MINE' ? (
              <Field htmlFor="decision-note" label="Nota de la decision" hint="Opcional. Se envia a quien hizo la solicitud.">
                <Input id="decision-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} />
              </Field>
            ) : null}
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
