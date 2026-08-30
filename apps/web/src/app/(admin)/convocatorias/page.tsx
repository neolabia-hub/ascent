'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarDays, Plus, Search } from 'lucide-react';
import { listActivities, type ActivityListItem } from '@/lib/catalog-api';
import {
  isOutdatedVersion,
  listOfferings,
  type OfferingKind,
  type OfferingListItem,
  type OfferingStatus,
  type OfferingsPage,
} from '@/lib/delivery-api';
import { formatDate } from '@/lib/format';
import { NewOfferingDrawer } from '@/components/modules/delivery/new-offering-drawer';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
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

  const [drawerOpen, setDrawerOpen] = useState(false);
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
  }, []);

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
                      <div className="text-xs text-ink-500">
                        {offering.activityVersion.activity.process.name} · version {offering.activityVersion.versionNumber}
                      </div>
                      {/* Se ve desde el listado: si no, hay que abrir una por una para descubrirlo. */}
                      {isOutdatedVersion(offering.activityVersion) &&
                      offering.status !== 'COMPLETED' &&
                      offering.status !== 'CANCELLED' ? (
                        <div className="mt-1 text-xs font-medium text-warn">Hay una version mas nueva</div>
                      ) : null}
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

      {/*
        El formulario vive en un componente propio porque el PLAN tambien lo usa: desde alli se
        crea la jornada sin salir a esta pantalla. Duplicarlo garantizaba que los dos se
        separaran en cuanto alguien tocara uno.
      */}
      <NewOfferingDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onCreated={(offering) => {
          showToast({ kind: 'success', title: 'Convocatoria creada', description: `Quedo en borrador con el numero ${offering.code}.` });
          router.push(`/convocatorias/${offering.id}`);
        }}
      />
    </div>
  );
}
