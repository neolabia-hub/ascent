'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarDays, Plus, Search } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { listCatalog, type CatalogRow } from '@/lib/admin-api';
import { listActivities, type ActivityListItem } from '@/lib/catalog-api';
import {
  createOffering,
  listOfferings,
  type OfferingKind,
  type OfferingListItem,
  type OfferingStatus,
  type OfferingsPage,
} from '@/lib/delivery-api';
import { formatDate } from '@/lib/format';
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

const STATUS_LABEL: Record<OfferingStatus, { kind: StatusPillKind; label: string }> = {
  DRAFT: { kind: 'neutral', label: 'BORRADOR' },
  PUBLISHED: { kind: 'info', label: 'PUBLICADA' },
  IN_PROGRESS: { kind: 'warn', label: 'EN CURSO' },
  COMPLETED: { kind: 'ok', label: 'EJECUTADA' },
  CANCELLED: { kind: 'danger', label: 'CANCELADA' },
};

const KIND_LABEL: Record<OfferingKind, string> = {
  EVENT: 'Sesion programada',
  PERMANENT: 'Permanente (autoservicio)',
  HYBRID: 'Mixta',
};

interface PublishedVersionOption {
  versionId: string;
  label: string;
}

/** Solo se convoca contenido PUBLICADO: un borrador todavia puede cambiar. */
function publishedVersions(activities: ActivityListItem[]): PublishedVersionOption[] {
  return activities.flatMap((activity) => {
    const published = activity.versions.find((version) => version.status === 'PUBLISHED');
    return published ? [{ versionId: published.id, label: `${activity.name} (v${published.versionNumber})` }] : [];
  });
}

export default function ConvocatoriasPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<OfferingsPage | null>(null);

  const [versions, setVersions] = useState<PublishedVersionOption[]>([]);
  const [regionals, setRegionals] = useState<CatalogRow[]>([]);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    activityVersionId: '',
    kind: 'EVENT' as OfferingKind,
    modality: 'PRESENCIAL' as 'PRESENCIAL' | 'VIRTUAL' | 'HIBRIDA',
    scheduledDate: '',
    startTime: '08:00',
    endTime: '12:00',
    windowStart: '',
    windowEnd: '',
    intensityTheoryHours: '',
    intensityPracticeHours: '',
    location: '',
    regionalId: '',
    capacity: '',
  });

  const load = useCallback(async () => {
    try {
      setData(await listOfferings({ q: q || undefined, status: status || undefined, page }));
    } catch {
      showToast({ kind: 'danger', title: 'No se pudieron cargar las convocatorias' });
    }
  }, [q, status, page, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void listActivities({ pageSize: 100 }).then((result) => setVersions(publishedVersions(result.items)));
    void listCatalog('regionals').then((rows) => setRegionals(rows.filter((row) => row.active)));
  }, []);

  const isEvent = form.kind !== 'PERMANENT';

  const create = async () => {
    setCreating(true);
    setFormError(null);
    try {
      const offering = await createOffering({
        activityVersionId: form.activityVersionId,
        kind: form.kind,
        modality: form.modality,
        scheduledDate: isEvent ? form.scheduledDate : null,
        startTime: isEvent ? form.startTime : null,
        endTime: isEvent ? form.endTime : null,
        windowStart: form.windowStart || null,
        windowEnd: form.windowEnd || null,
        intensityTheoryHours: form.intensityTheoryHours ? Number(form.intensityTheoryHours) : null,
        intensityPracticeHours: form.intensityPracticeHours ? Number(form.intensityPracticeHours) : null,
        executedBy: 'PROPIOS',
        location: form.location || null,
        regionalId: form.regionalId || null,
        capacity: form.capacity ? Number(form.capacity) : null,
      });
      showToast({ kind: 'success', title: 'Convocatoria creada', description: `Quedo en borrador con el numero ${offering.code}.` });
      router.push(`/convocatorias/${offering.id}`);
    } catch (error) {
      setFormError(
        error instanceof ApiError && error.code === 'VERSION_NOT_PUBLISHED'
          ? 'Esa version no esta publicada: publicala antes de programarla.'
          : 'No se pudo crear la convocatoria. Revisa fecha, lugar y modalidad.',
      );
    } finally {
      setCreating(false);
    }
  };

  const valid =
    Boolean(form.activityVersionId) &&
    (!isEvent || Boolean(form.scheduledDate)) &&
    (form.modality === 'VIRTUAL' || !isEvent || form.location.trim().length > 0);

  const from = data ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = data ? Math.min(data.page * data.pageSize, data.total) : 0;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-semibold text-ink-900">Convocatorias</h1>
          <p className="mt-1 text-sm text-ink-500">
            Cuando, donde y con quien se dicta una version publicada. Al publicarla se congelan los proyectados.
          </p>
        </div>
        <Button onClick={() => setDrawerOpen(true)} disabled={versions.length === 0}>
          <Plus size={16} />
          Nueva convocatoria
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
          <Input
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setPage(1);
            }}
            placeholder="Buscar por numero, actividad o lugar"
            className="w-80 pl-9"
          />
        </div>
        <Select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          className="w-52"
        >
          <option value="">Todos los estados</option>
          <option value="DRAFT">Borrador</option>
          <option value="PUBLISHED">Publicada</option>
          <option value="COMPLETED">Ejecutada</option>
          <option value="CANCELLED">Cancelada</option>
        </Select>
      </div>

      {!data ? (
        <Skeleton className="h-96 w-full" />
      ) : data.total === 0 ? (
        <div className="card">
          <EmptyState
            icon={CalendarDays}
            title="Sin convocatorias todavia"
            description={
              versions.length === 0
                ? 'Primero publica una version de una actividad formativa: solo se convoca contenido publicado.'
                : 'Programa la primera jornada: una sesion con fecha e instructor, o una virtual permanente.'
            }
            action={
              versions.length > 0 ? (
                <Button onClick={() => setDrawerOpen(true)}>
                  <Plus size={16} />
                  Nueva convocatoria
                </Button>
              ) : (
                <Link href="/contenido-formativo">
                  <Button variant="ghost">Ir al contenido formativo</Button>
                </Link>
              )
            }
          />
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <Tr>
                  <Th>Convocatoria</Th>
                  <Th>Actividad</Th>
                  <Th>Fecha</Th>
                  <Th>Regional</Th>
                  <Th className="text-right">Proyectados</Th>
                  <Th className="text-right">Inscritos</Th>
                  <Th>Estado</Th>
                  <Th className="w-24 text-right">Accion</Th>
                </Tr>
              </THead>
              <TBody>
                {data.items.map((offering: OfferingListItem) => (
                  <Tr key={offering.id}>
                    <Td>
                      <div className="font-mono text-xs text-ink-500">{offering.code}</div>
                      <div className="text-xs text-ink-500">{KIND_LABEL[offering.kind]}</div>
                    </Td>
                    <Td>
                      <div className="font-medium text-ink-900">{offering.activityVersion.activity.name}</div>
                      <div className="text-xs text-ink-500">{offering.activityVersion.activity.process.name}</div>
                    </Td>
                    <Td className="text-ink-700">
                      {offering.scheduledDate ? formatDate(offering.scheduledDate) : 'Permanente'}
                      {offering.startTime ? <span className="ml-1 text-xs text-ink-500">{offering.startTime}</span> : null}
                    </Td>
                    <Td className="text-ink-500">{offering.regional?.name ?? 'Todas'}</Td>
                    <Td className="text-right tabular-nums text-ink-700">{offering.projectedCount ?? '—'}</Td>
                    <Td className="text-right tabular-nums text-ink-700">{offering._count.enrollments}</Td>
                    <Td>
                      <StatusPill kind={STATUS_LABEL[offering.status].kind} label={STATUS_LABEL[offering.status].label} />
                    </Td>
                    <Td className="text-right">
                      <Link href={`/convocatorias/${offering.id}`}>
                        <Button variant="ghost" size="sm">
                          Abrir
                        </Button>
                      </Link>
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
            onPrevious={() => setPage((current) => Math.max(1, current - 1))}
            onNext={() => setPage((current) => current + 1)}
          />
        </div>
      )}

      <Drawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title="Nueva convocatoria"
        description="Queda en borrador. Al publicarla se congelan los proyectados y se puede inscribir gente."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDrawerOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={create} loading={creating} disabled={!valid}>
              Crear convocatoria
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field htmlFor="o-version" label="Version publicada" required hint="Solo aparece contenido ya publicado.">
            <Select
              id="o-version"
              value={form.activityVersionId}
              onChange={(event) => setForm({ ...form, activityVersionId: event.target.value })}
            >
              <option value="">Seleccionar...</option>
              {versions.map((version) => (
                <option key={version.versionId} value={version.versionId}>
                  {version.label}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field htmlFor="o-kind" label="Forma" required>
              <Select id="o-kind" value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as OfferingKind })}>
                <option value="EVENT">Sesion programada</option>
                <option value="PERMANENT">Permanente (autoservicio)</option>
                <option value="HYBRID">Mixta</option>
              </Select>
            </Field>
            <Field htmlFor="o-modality" label="Modalidad" required>
              <Select
                id="o-modality"
                value={form.modality}
                onChange={(event) => setForm({ ...form, modality: event.target.value as typeof form.modality })}
              >
                <option value="PRESENCIAL">Presencial</option>
                <option value="VIRTUAL">Virtual</option>
                <option value="HIBRIDA">Hibrida</option>
              </Select>
            </Field>
          </div>

          {isEvent ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <Field htmlFor="o-date" label="Fecha" required>
                  <Input
                    id="o-date"
                    type="date"
                    value={form.scheduledDate}
                    onChange={(event) => setForm({ ...form, scheduledDate: event.target.value })}
                  />
                </Field>
                <Field htmlFor="o-start" label="Inicio">
                  <Input id="o-start" type="time" value={form.startTime} onChange={(event) => setForm({ ...form, startTime: event.target.value })} />
                </Field>
                <Field htmlFor="o-end" label="Fin">
                  <Input id="o-end" type="time" value={form.endTime} onChange={(event) => setForm({ ...form, endTime: event.target.value })} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field htmlFor="o-theory" label="Horas teoricas" hint="El desglose lo exige el PESV y suma para BPM.">
                  <Input
                    id="o-theory"
                    type="number"
                    min={0}
                    step="0.5"
                    value={form.intensityTheoryHours}
                    onChange={(event) => setForm({ ...form, intensityTheoryHours: event.target.value })}
                  />
                </Field>
                <Field htmlFor="o-practice" label="Horas practicas">
                  <Input
                    id="o-practice"
                    type="number"
                    min={0}
                    step="0.5"
                    value={form.intensityPracticeHours}
                    onChange={(event) => setForm({ ...form, intensityPracticeHours: event.target.value })}
                  />
                </Field>
              </div>
            </>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field htmlFor="o-wstart" label="Disponible desde">
                <Input id="o-wstart" type="date" value={form.windowStart} onChange={(event) => setForm({ ...form, windowStart: event.target.value })} />
              </Field>
              <Field htmlFor="o-wend" label="Disponible hasta">
                <Input id="o-wend" type="date" value={form.windowEnd} onChange={(event) => setForm({ ...form, windowEnd: event.target.value })} />
              </Field>
            </div>
          )}

          {isEvent && form.modality !== 'VIRTUAL' ? (
            <Field htmlFor="o-location" label="Lugar" required>
              <Input id="o-location" value={form.location} onChange={(event) => setForm({ ...form, location: event.target.value })} maxLength={200} />
            </Field>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <Field htmlFor="o-regional" label="Regional" hint="Si la eliges, los proyectados se acotan a esa sede.">
              <Select id="o-regional" value={form.regionalId} onChange={(event) => setForm({ ...form, regionalId: event.target.value })}>
                <option value="">Todas</option>
                {regionals.map((regional) => (
                  <option key={regional.id} value={regional.id}>
                    {regional.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field htmlFor="o-capacity" label="Cupo">
              <Input
                id="o-capacity"
                type="number"
                min={1}
                value={form.capacity}
                onChange={(event) => setForm({ ...form, capacity: event.target.value })}
              />
            </Field>
          </div>

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
