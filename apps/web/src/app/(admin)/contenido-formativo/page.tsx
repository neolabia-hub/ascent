'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BookOpen, Plus, Search } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { listCatalog, type CatalogRow } from '@/lib/admin-api';
import { createActivity, listActivities, type ActivitiesPage, type Modality } from '@/lib/catalog-api';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill, type StatusPillKind } from '@/components/ui/status-pill';
import { Table, TablePagination, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { useToast } from '@/components/ui/toast';

const MODALITY_LABEL: Record<Modality, string> = {
  PRESENCIAL: 'Presencial',
  VIRTUAL: 'Virtual',
  HIBRIDA: 'Hibrida',
};

/** Estado que se muestra: manda la version publicada; si no hay, el borrador. */
function versionState(versions: Array<{ status: string; versionNumber: number }>): { kind: StatusPillKind; label: string } {
  const published = versions.find((v) => v.status === 'PUBLISHED');
  if (published) return { kind: 'ok', label: `PUBLICADA v${published.versionNumber}` };
  const draft = versions.find((v) => v.status === 'DRAFT');
  if (draft) return { kind: 'neutral', label: `BORRADOR v${draft.versionNumber}` };
  return { kind: 'neutral', label: 'SIN VERSION' };
}

export default function ContenidoFormativoPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [q, setQ] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ActivitiesPage | null>(null);
  const [types, setTypes] = useState<CatalogRow[]>([]);
  const [processes, setProcesses] = useState<CatalogRow[]>([]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: '',
    name: '',
    description: '',
    activityTypeId: '',
    processId: '',
    modality: 'VIRTUAL' as Modality,
  });

  const load = useCallback(async () => {
    try {
      setData(await listActivities({ q: q || undefined, activityTypeId: typeFilter || undefined, page }));
    } catch {
      showToast({ kind: 'danger', title: 'No se pudo cargar el contenido formativo' });
    }
  }, [q, typeFilter, page, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void listCatalog('activity-types').then((r) => setTypes(r.filter((t) => t.active)));
    void listCatalog('processes').then((r) => setProcesses(r.filter((p) => p.active)));
  }, []);

  const create = async () => {
    setCreating(true);
    setFormError(null);
    try {
      const activity = await createActivity({
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        description: form.description.trim() || null,
        activityTypeId: form.activityTypeId,
        processId: form.processId,
        modality: form.modality,
      });
      showToast({ kind: 'success', title: 'Actividad creada', description: 'Se abrio su version 1 en borrador.' });
      router.push(`/contenido-formativo/${activity.id}`);
    } catch (error) {
      setFormError(
        error instanceof ApiError && error.code === 'DUPLICATE_CODE'
          ? 'Ya existe una actividad con ese codigo.'
          : 'No se pudo crear la actividad. Revisa los campos.',
      );
    } finally {
      setCreating(false);
    }
  };

  const valid = form.code.trim().length >= 2 && form.name.trim().length >= 3 && form.activityTypeId && form.processId;
  const from = data ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = data ? Math.min(data.page * data.pageSize, data.total) : 0;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-semibold text-ink-900">Contenido formativo</h1>
          <p className="mt-1 text-sm text-ink-500">
            Actividades formativas del catalogo. Cada una guarda sus versiones: publicar congela lo que la gente cursa.
          </p>
        </div>
        <Button onClick={() => setDrawerOpen(true)}>
          <Plus size={16} />
          Nueva actividad
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar por nombre o codigo"
            className="w-72 pl-9"
          />
        </div>
        <Select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value);
            setPage(1);
          }}
          className="w-56"
        >
          <option value="">Todos los tipos</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
      </div>

      {!data ? (
        <Skeleton className="h-96 w-full" />
      ) : data.total === 0 ? (
        <div className="card">
          <EmptyState
            icon={BookOpen}
            title="Sin actividades todavia"
            description="Crea la primera actividad formativa: una induccion, una capacitacion del plan o una pildora."
            action={
              <Button onClick={() => setDrawerOpen(true)}>
                <Plus size={16} />
                Nueva actividad
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
                  <Th>Actividad</Th>
                  <Th>Tipo</Th>
                  <Th>Proceso</Th>
                  <Th>Modalidad</Th>
                  <Th>Estado</Th>
                  <Th className="w-24 text-right">Accion</Th>
                </Tr>
              </THead>
              <TBody>
                {data.items.map((activity) => {
                  const state = versionState(activity.versions);
                  return (
                    <Tr key={activity.id}>
                      <Td>
                        <div className="font-medium text-ink-900">{activity.name}</div>
                        <div className="font-mono text-xs text-ink-500">{activity.code}</div>
                      </Td>
                      <Td>
                        <span className="inline-flex items-center gap-2 text-ink-700">
                          <span
                            className="inline-block h-2 w-2 rounded-full"
                            style={{ backgroundColor: activity.activityType.colorHex ?? 'var(--ink-300)' }}
                          />
                          {activity.activityType.name}
                        </span>
                      </Td>
                      <Td className="text-ink-700">{activity.process.name}</Td>
                      <Td className="text-ink-500">{MODALITY_LABEL[activity.modality]}</Td>
                      <Td>
                        <StatusPill kind={state.kind} label={state.label} />
                      </Td>
                      <Td className="text-right">
                        <Link href={`/contenido-formativo/${activity.id}`}>
                          <Button variant="ghost" size="sm">
                            Abrir
                          </Button>
                        </Link>
                      </Td>
                    </Tr>
                  );
                })}
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
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title="Nueva actividad formativa"
        description="Se crea con su version 1 en borrador, lista para armar el contenido."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDrawerOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={create} loading={creating} disabled={!valid}>
              Crear actividad
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field htmlFor="a-code" label="Codigo" required hint="Identificador corto y estable. No se puede cambiar.">
            <Input
              id="a-code"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              placeholder="IND_GENERAL"
              maxLength={40}
            />
          </Field>
          <Field htmlFor="a-name" label="Nombre" required>
            <Input id="a-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={200} />
          </Field>
          <Field htmlFor="a-desc" label="Descripcion">
            <textarea
              id="a-desc"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              maxLength={4000}
              rows={3}
              className="focus-ring block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink-900"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field htmlFor="a-type" label="Tipo de actividad" required>
              <Select id="a-type" value={form.activityTypeId} onChange={(e) => setForm({ ...form, activityTypeId: e.target.value })}>
                <option value="">Seleccionar...</option>
                {types.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field htmlFor="a-process" label="Proceso" required hint="Sistema de gestion que la origina.">
              <Select id="a-process" value={form.processId} onChange={(e) => setForm({ ...form, processId: e.target.value })}>
                <option value="">Seleccionar...</option>
                {processes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field htmlFor="a-modality" label="Modalidad">
            <Select id="a-modality" value={form.modality} onChange={(e) => setForm({ ...form, modality: e.target.value as Modality })}>
              <option value="VIRTUAL">Virtual</option>
              <option value="PRESENCIAL">Presencial</option>
              <option value="HIBRIDA">Hibrida</option>
            </Select>
          </Field>
          {formError ? (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
              {formError}
            </p>
          ) : null}
        </div>
      </Drawer>
    </div>
  );
}
