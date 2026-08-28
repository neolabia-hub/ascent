'use client';

import { UserPlus, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { listCatalog, listUsers, type CatalogRow, type UserRow } from '@/lib/admin-api';
import { createAssignments, listAssignments, type AssignmentRow } from '@/lib/delivery-api';
import { formatDate } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { MultiSelect } from '@/components/ui/multi-select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { TBody, THead, Table, Td, Th, Tr } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';

/**
 * QUIENES — la obligacion, desde la formacion misma.
 *
 * Antes esto solo existia en el modulo de Asignaciones, lejos de donde se crea la formacion. Y
 * asignar es la ULTIMA cosa que uno quiere hacer despues de armar el contenido: obligar a salir
 * a otra pantalla es obligar a acordarse de volver.
 *
 * Se asigna a cargos, areas, regionales o personas concretas. Todo a la vez si hace falta: el
 * backend cruza las listas y no duplica a quien ya la tenia pendiente.
 *
 * Lo que se ve abajo son OBLIGACIONES, no inscripciones: alguien puede estar obligado sin haber
 * empezado, y ese es justo el estado que interesa a cumplimiento.
 */
export function ActivityAudienceTab({ activityId, activityName }: { activityId: string; activityName: string }) {
  const { showToast } = useToast();
  const [rows, setRows] = useState<AssignmentRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [catalogs, setCatalogs] = useState<{ jobTitles: CatalogRow[]; areas: CatalogRow[]; regionals: CatalogRow[] } | null>(null);
  const [people, setPeople] = useState<UserRow[]>([]);
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState<{ jobTitleIds: string[]; areaIds: string[]; regionalIds: string[]; userIds: string[]; dueAt: string }>({
    jobTitleIds: [],
    areaIds: [],
    regionalIds: [],
    userIds: [],
    dueAt: '',
  });

  const load = useCallback(async () => {
    try {
      const page = await listAssignments({ targetId: activityId });
      setRows(page.items);
      setTotal(page.total);
    } catch {
      setRows([]);
    }
  }, [activityId]);

  useEffect(() => {
    void load();
    void Promise.all([listCatalog('job-titles'), listCatalog('areas'), listCatalog('regionals')])
      .then(([jobTitles, areas, regionals]) => setCatalogs({ jobTitles, areas, regionals }))
      .catch(() => undefined);
    void listUsers({ active: 'true', pageSize: 200 })
      .then((page) => setPeople(page.items))
      .catch(() => undefined);
  }, [load]);

  const nothingChosen =
    form.jobTitleIds.length === 0 && form.areaIds.length === 0 && form.regionalIds.length === 0 && form.userIds.length === 0;

  const assign = async () => {
    setBusy(true);
    try {
      const result = await createAssignments({
        targetId: activityId,
        jobTitleIds: form.jobTitleIds,
        areaIds: form.areaIds,
        regionalIds: form.regionalIds,
        userIds: form.userIds,
        dueAt: form.dueAt || null,
      });
      setForm({ jobTitleIds: [], areaIds: [], regionalIds: [], userIds: [], dueAt: '' });
      await load();
      showToast({
        kind: 'success',
        title: `${result.created} obligaciones creadas`,
        description: result.skipped > 0 ? `${result.skipped} ya la tenian pendiente.` : undefined,
      });
    } catch {
      showToast({ kind: 'danger', title: 'No se pudo asignar' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
      <section className="card h-fit p-5">
        <h2 className="font-display text-base font-semibold text-ink-900">Asignar esta formacion</h2>
        <p className="mb-4 mt-1 text-sm text-ink-500">
          Se puede combinar. A quien ya la tenga pendiente no se le duplica.
        </p>

        {!catalogs ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="space-y-4">
            <Field htmlFor="q-jobs" label="A todos los de un cargo">
              <MultiSelect
                id="q-jobs"
                placeholder="Ningun cargo"
                options={catalogs.jobTitles.map((row) => ({ id: row.id, label: row.name, hint: row.jobTitleType?.name }))}
                value={form.jobTitleIds}
                onChange={(jobTitleIds) => setForm({ ...form, jobTitleIds })}
              />
            </Field>
            <Field htmlFor="q-areas" label="A toda un area">
              <MultiSelect
                id="q-areas"
                placeholder="Ninguna area"
                options={catalogs.areas.map((row) => ({ id: row.id, label: row.name }))}
                value={form.areaIds}
                onChange={(areaIds) => setForm({ ...form, areaIds })}
              />
            </Field>
            <Field htmlFor="q-regionals" label="A una regional">
              <MultiSelect
                id="q-regionals"
                placeholder="Ninguna regional"
                options={catalogs.regionals.map((row) => ({ id: row.id, label: row.name }))}
                value={form.regionalIds}
                onChange={(regionalIds) => setForm({ ...form, regionalIds })}
              />
            </Field>
            <Field htmlFor="q-people" label="A personas concretas">
              <MultiSelect
                id="q-people"
                placeholder="Nadie en particular"
                options={people.map((person) => ({ id: person.id, label: person.fullName, hint: person.jobTitle.name }))}
                value={form.userIds}
                onChange={(userIds) => setForm({ ...form, userIds })}
              />
            </Field>
            <Field htmlFor="q-due" label="Fecha limite" hint="Vacio: sin fecha, no vence.">
              <Input id="q-due" type="date" value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} />
            </Field>

            <Button className="w-full" onClick={() => void assign()} loading={busy} disabled={nothingChosen}>
              <UserPlus size={16} />
              Asignar
            </Button>
            {nothingChosen ? (
              <p className="text-center text-xs text-ink-500">Elige al menos un cargo, area, regional o persona.</p>
            ) : null}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-lg font-semibold text-ink-900">Quienes la tienen que hacer</h2>
          {rows ? <span className="text-sm text-ink-500">{total} en total</span> : null}
        </div>

        {!rows ? (
          <Skeleton className="h-64 w-full" />
        ) : rows.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={Users}
              title="Nadie tiene que hacerla todavia"
              description={`"${activityName}" existe, pero no se le exige a nadie. Asignala a la izquierda, o crea un requisito para que nazca sola cuando entre alguien.`}
            />
          </div>
        ) : (
          <div className="card overflow-hidden">
            <Table>
              <THead>
                <Tr>
                  <Th>Persona</Th>
                  <Th>Cargo</Th>
                  <Th>Vence</Th>
                  <Th>Estado</Th>
                  <Th>Origen</Th>
                </Tr>
              </THead>
              <TBody>
                {rows.map((row) => (
                  <Tr key={row.id}>
                    <Td className="font-medium text-ink-900">{row.user.fullName}</Td>
                    <Td className="text-ink-500">{row.user.jobTitle.name}</Td>
                    <Td className="text-ink-500">{formatDate(row.dueAt)}</Td>
                    <Td>
                      <StatusPill kind={statusKind(row.status)} label={statusLabel(row.status)} />
                    </Td>
                    <Td className="text-ink-500">{sourceLabel(row.source)}</Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}

function statusKind(status: string): 'ok' | 'warn' | 'danger' | 'neutral' {
  if (status === 'COMPLETED') return 'ok';
  if (status === 'OVERDUE') return 'danger';
  if (status === 'PENDING' || status === 'IN_PROGRESS') return 'warn';
  return 'neutral';
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    PENDING: 'PENDIENTE',
    IN_PROGRESS: 'EN CURSO',
    COMPLETED: 'CUMPLIDA',
    OVERDUE: 'VENCIDA',
    WITHDRAWN_LEFT_AUDIENCE: 'RETIRADA',
    WAIVED: 'EXIMIDA',
  };
  return map[status] ?? status;
}

function sourceLabel(source: string): string {
  const map: Record<string, string> = {
    MANUAL: 'Asignacion directa',
    RULE: 'Requisito',
    PLAN: 'Plan anual',
    STATIC_SNAPSHOT: 'Instantanea',
  };
  return map[source] ?? source;
}
