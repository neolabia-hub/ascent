'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  FileText,
  Layers,
  Link2,
  Lock,
  Package,
  Plus,
  Trash2,
  Users,
  Video,
} from 'lucide-react';
import { ApiError, me } from '@/lib/api';
import {
  createNextVersion,
  discardDraft,
  getActivity,
  getVersion,
  publishVersion,
  removeContent,
  reorderContents,
  updateVersionSettings,
  type ActivityDetail,
  type ContentType,
  type MigrationPolicy,
  type VersionDetail,
} from '@/lib/catalog-api';
import { ActivityAudienceTab } from '@/components/modules/authoring/activity-audience-tab';
import { ActivityInfoTab } from '@/components/modules/authoring/activity-info-tab';
import { ActivityScheduleTab } from '@/components/modules/authoring/activity-schedule-tab';
import { AddContentDrawer } from '@/components/modules/authoring/add-content-drawer';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Drawer } from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';

/**
 * LA FORMACION, EN UN SOLO SITIO.
 *
 * Antes esta pantalla solo mostraba la lista de contenidos, y todo lo demas vivia en modulos
 * sueltos: la ficha se llenaba a medias al crearla, las lecciones en "Lecciones", los examenes en
 * "Evaluaciones", la asignacion en "Asignaciones" y la fecha en "Convocatorias". Cinco sitios
 * para una sola cosa, y el autor tenia que acordarse de visitarlos todos.
 *
 * Ahora es una ficha con pestanas, que es como lo resuelven las plataformas del sector: el curso
 * es el contenedor y todo cuelga de el. El orden de las pestanas es el orden en que se hace el
 * trabajo: describir, armar, asignar, programar, publicar.
 */

const CONTENT_META: Record<ContentType, { label: string; icon: typeof FileText }> = {
  LESSON: { label: 'Leccion en tarjetas', icon: Layers },
  VIDEO: { label: 'Video', icon: Video },
  DOCUMENT: { label: 'Documento', icon: FileText },
  ASSESSMENT: { label: 'Evaluacion', icon: ClipboardCheck },
  SURVEY: { label: 'Encuesta', icon: ClipboardCheck },
  SCORM: { label: 'Paquete SCORM', icon: Package },
  LINK: { label: 'Enlace', icon: Link2 },
};

const MIGRATION_LABEL: Record<MigrationPolicy, { title: string; detail: string }> = {
  MOVE_NOT_STARTED: {
    title: 'Solo quienes no han empezado pasan a la version nueva',
    detail: 'Recomendado. Quien va a mitad termina con el contenido que ya conocia.',
  },
  FINISH_OLD: {
    title: 'Todos los inscritos terminan en la version anterior',
    detail: 'La version nueva solo aplica a inscripciones futuras.',
  },
  RESTART_NEW: {
    title: 'Quienes van a mitad reinician en la version nueva',
    detail: 'Uselo cuando el cambio es tan importante que lo anterior ya no sirve.',
  },
};

type TabKey = 'info' | 'contenido' | 'quienes' | 'programacion' | 'versiones';

const TABS: Array<{ key: TabKey; label: string; icon: typeof FileText }> = [
  { key: 'info', label: 'Ficha', icon: FileText },
  { key: 'contenido', label: 'Contenido', icon: Layers },
  { key: 'quienes', label: 'Quienes', icon: Users },
  { key: 'programacion', label: 'Programacion', icon: CalendarDays },
  { key: 'versiones', label: 'Versiones', icon: Package },
];

export default function ActividadDetallePage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const activityId = params.id;
  const { showToast } = useToast();

  const [tab, setTab] = useState<TabKey>('info');
  const [activity, setActivity] = useState<ActivityDetail | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [version, setVersion] = useState<VersionDetail | null>(null);
  const [busy, setBusy] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [migrationPolicy, setMigrationPolicy] = useState<MigrationPolicy>('MOVE_NOT_STARTED');
  const [publishError, setPublishError] = useState<string | null>(null);
  const [justification, setJustification] = useState('');
  const [canPublish, setCanPublish] = useState(true);

  // Al volver del editor de tarjetas se aterriza en Contenido, que es de donde se salio.
  useEffect(() => {
    const requested = searchParams.get('tab');
    if (requested && TABS.some((item) => item.key === requested)) setTab(requested as TabKey);
  }, [searchParams]);

  const loadActivity = useCallback(async () => {
    try {
      const detail = await getActivity(activityId);
      setActivity(detail);
      setSelectedVersionId((current) => {
        if (current && detail.versions.some((row) => row.id === current)) return current;
        const draft = detail.versions.find((row) => row.status === 'DRAFT');
        return draft?.id ?? detail.versions[0]?.id ?? null;
      });
    } catch {
      showToast({ kind: 'danger', title: 'No se pudo cargar la formacion' });
    }
  }, [activityId, showToast]);

  useEffect(() => {
    void loadActivity();
  }, [loadActivity]);

  useEffect(() => {
    if (!selectedVersionId) return;
    setVersion(null);
    void getVersion(selectedVersionId).then(setVersion).catch(() => undefined);
  }, [selectedVersionId]);

  useEffect(() => {
    void me()
      .then((session) => setCanPublish(session.permissions.includes('catalog:publish')))
      .catch(() => undefined);
  }, []);

  const isDraft = version?.status === 'DRAFT';

  const refreshVersion = useCallback(async () => {
    if (!selectedVersionId) return;
    setVersion(await getVersion(selectedVersionId));
  }, [selectedVersionId]);

  const move = async (index: number, direction: -1 | 1) => {
    if (!version) return;
    const ids = version.contents.map((content) => content.id);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    const swapped = [...ids];
    const current = swapped[index] as string;
    swapped[index] = swapped[target] as string;
    swapped[target] = current;
    try {
      await reorderContents(version.id, swapped);
      await refreshVersion();
    } catch {
      showToast({ kind: 'danger', title: 'No se pudo reordenar' });
    }
  };

  const doRemoveContent = async (contentId: string) => {
    try {
      await removeContent(contentId);
      await refreshVersion();
      showToast({ kind: 'success', title: 'Contenido eliminado' });
    } catch {
      showToast({ kind: 'danger', title: 'No se pudo eliminar el contenido' });
    }
  };

  const saveSettings = async (field: 'passingScore' | 'maxAttempts', value: number) => {
    if (!version) return;
    try {
      await updateVersionSettings(version.id, { [field]: value });
      await refreshVersion();
    } catch {
      showToast({ kind: 'danger', title: 'No se pudo guardar el ajuste' });
    }
  };

  const doPublish = async () => {
    if (!version) return;
    setBusy(true);
    setPublishError(null);
    try {
      const result = await publishVersion(version.id, migrationPolicy, justification.trim() || undefined);
      setPublishOpen(false);
      await loadActivity();
      await refreshVersion();
      if (result.executed) {
        showToast({
          kind: 'success',
          title: `Version ${version.versionNumber} publicada`,
          description: 'El contenido quedo congelado: lo que se cursa ya no puede cambiar.',
        });
      } else {
        showToast({
          kind: 'info',
          title: 'Solicitud enviada a aprobacion',
          description: 'Un administrador debe aprobarla. Se publicara automaticamente al aprobarse.',
        });
      }
    } catch (error) {
      if (error instanceof ApiError) {
        const map: Record<string, string> = {
          VERSION_EMPTY: 'La version necesita al menos un contenido.',
          CONTENT_INCOMPLETE: 'Hay contenidos sin material asignado. Completalos antes de publicar.',
        };
        setPublishError(map[error.code] ?? error.message);
      } else {
        setPublishError('No se pudo publicar.');
      }
    } finally {
      setBusy(false);
    }
  };

  const doCreateNextVersion = async () => {
    setBusy(true);
    try {
      const draft = await createNextVersion(activityId);
      await loadActivity();
      setSelectedVersionId(draft.id);
      setTab('contenido');
      showToast({
        kind: 'success',
        title: `Version ${draft.versionNumber} creada en borrador`,
        description: 'La version publicada no se modifico.',
      });
    } catch (error) {
      showToast({
        kind: 'danger',
        title:
          error instanceof ApiError && error.code === 'DRAFT_ALREADY_EXISTS'
            ? 'Ya existe una version en borrador.'
            : 'No se pudo crear la version.',
      });
    } finally {
      setBusy(false);
    }
  };

  const doDiscardDraft = async () => {
    if (!version) return;
    try {
      await discardDraft(version.id);
      await loadActivity();
      showToast({ kind: 'success', title: 'Borrador descartado' });
    } catch (error) {
      showToast({
        kind: 'danger',
        title:
          error instanceof ApiError && error.code === 'LAST_VERSION'
            ? 'No se puede descartar la unica version.'
            : 'No se pudo descartar.',
      });
    }
  };

  if (!activity) return <Skeleton className="h-96 w-full" />;

  const publishedVersion = activity.versions.find((row) => row.status === 'PUBLISHED');
  const hasDraft = activity.versions.some((row) => row.status === 'DRAFT');

  return (
    <div>
      <Link
        href="/contenido-formativo"
        className="focus-ring mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-700"
      >
        <ArrowLeft size={14} />
        Formaciones
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-[28px] font-semibold text-ink-900">{activity.name}</h1>
            <span
              className="rounded-full px-2 py-0.5 text-xs font-medium"
              style={{
                backgroundColor: `color-mix(in srgb, ${activity.activityType.colorHex ?? '#5b6572'} 12%, white)`,
                color: activity.activityType.colorHex ?? 'var(--ink-700)',
              }}
            >
              {activity.activityType.name}
            </span>
          </div>
          <p className="mt-1 font-mono text-xs text-ink-500">
            {activity.code} · {activity.process.name}
          </p>
        </div>
        <div className="flex gap-2">
          {publishedVersion && !hasDraft ? (
            <Button variant="outline" onClick={() => void doCreateNextVersion()} loading={busy}>
              <Plus size={16} />
              Nueva version
            </Button>
          ) : null}
          {isDraft ? (
            <Button onClick={() => setPublishOpen(true)} disabled={!version || version.contents.length === 0}>
              {canPublish ? 'Publicar version' : 'Enviar a aprobacion'}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
        {TABS.map((item) => {
          const Icon = item.icon;
          const active = tab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key)}
              className={cn(
                'focus-ring -mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm transition-colors duration-150',
                active ? 'border-ink-900 font-medium text-ink-900' : 'border-transparent text-ink-500 hover:text-ink-900',
              )}
            >
              <Icon size={15} strokeWidth={1.75} />
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === 'info' ? <ActivityInfoTab activity={activity} onSaved={loadActivity} canEdit /> : null}

      {tab === 'quienes' ? <ActivityAudienceTab activityId={activity.id} activityName={activity.name} /> : null}

      {tab === 'programacion' ? (
        <ActivityScheduleTab
          activityId={activity.id}
          publishedVersionId={publishedVersion?.id ?? null}
          activityModality={activity.modality}
        />
      ) : null}

      {tab === 'contenido' ? (
        !version ? (
          <Skeleton className="h-80 w-full" />
        ) : (
          <div>
            {!isDraft ? (
              <div className="mb-4 flex items-start gap-2 rounded-lg bg-info-soft px-4 py-3 text-sm text-info">
                <Lock size={16} className="mt-0.5 shrink-0" />
                <p>
                  Estas viendo la version {version.versionNumber}, {version.status === 'PUBLISHED' ? 'publicada' : 'retirada'} e
                  inmutable: es exactamente lo que vio quien ya la curso. Para cambiar algo, crea una version nueva.
                </p>
              </div>
            ) : (
              <div className="mb-4 flex items-center justify-between gap-3 rounded-lg bg-paper px-4 py-2.5 text-sm text-ink-500">
                <span>
                  Editando la <strong className="font-medium text-ink-900">version {version.versionNumber}</strong> en borrador.
                </span>
                <Button size="sm" onClick={() => setAddOpen(true)}>
                  <Plus size={14} />
                  Agregar contenido
                </Button>
              </div>
            )}

            {version.contents.length === 0 ? (
              <div className="card">
                <EmptyState
                  icon={Layers}
                  title="Todavia no hay contenido"
                  description="Agrega lecciones, videos, documentos y la evaluacion. Todo se crea aqui mismo."
                  action={
                    isDraft ? (
                      <Button onClick={() => setAddOpen(true)}>
                        <Plus size={16} />
                        Agregar contenido
                      </Button>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              <ol className="space-y-2">
                {version.contents.map((content, index) => {
                  const meta = CONTENT_META[content.type];
                  const Icon = meta.icon;
                  return (
                    <li key={content.id} className="card card-hover flex items-center gap-3 p-4">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-paper text-sm font-medium text-ink-500">
                        {index + 1}
                      </span>
                      <Icon size={18} className="shrink-0 text-ink-500" strokeWidth={1.75} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-ink-900">{content.title}</p>
                        <p className="truncate text-xs text-ink-500">
                          {meta.label}
                          {content.lesson ? ` · ${content.lesson._count.cards} tarjetas` : ''}
                          {content.contentPackage ? ` · ${content.contentPackage.originalName}` : ''}
                          {content.assessmentVersion
                            ? ` · ${content.assessmentVersion.assessment.title} v${content.assessmentVersion.versionNumber}`
                            : ''}
                          {!content.isRequired ? ' · opcional' : ''}
                        </p>
                      </div>
                      {content.type === 'LESSON' && content.lessonId ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            router.push(
                              `/lecciones/${content.lessonId}?volverA=${encodeURIComponent(`/contenido-formativo/${activityId}?tab=contenido`)}`,
                            )
                          }
                        >
                          {isDraft ? 'Editar tarjetas' : 'Ver'}
                        </Button>
                      ) : null}
                      {isDraft ? (
                        <div className="flex items-center gap-0.5">
                          <Button variant="ghost" size="sm" onClick={() => void move(index, -1)} disabled={index === 0} aria-label="Subir">
                            <ChevronUp size={14} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => void move(index, 1)}
                            disabled={index === version.contents.length - 1}
                            aria-label="Bajar"
                          >
                            <ChevronDown size={14} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-danger"
                            onClick={() => void doRemoveContent(content.id)}
                            aria-label="Eliminar"
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        )
      ) : null}

      {tab === 'versiones' ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <section>
            <h2 className="mb-3 font-display text-lg font-semibold text-ink-900">Historial de versiones</h2>
            <p className="mb-4 text-sm text-ink-500">
              Cada publicacion congela el contenido. Un auditor puede preguntar que examen presento una persona en marzo, y
              la respuesta tiene que ser exacta.
            </p>
            <ul className="space-y-2">
              {activity.versions.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedVersionId(row.id)}
                    className={cn(
                      'focus-ring card card-hover flex w-full items-center gap-3 p-4 text-left',
                      row.id === selectedVersionId && 'border-primary',
                    )}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-ink-900">Version {row.versionNumber}</p>
                      <p className="text-xs text-ink-500">
                        {row.publishedAt ? `Publicada el ${new Date(row.publishedAt).toLocaleDateString('es-CO')}` : 'Sin publicar'}
                        {row._count ? ` · ${row._count.contents} contenidos` : ''}
                      </p>
                    </div>
                    <StatusPill
                      kind={row.status === 'PUBLISHED' ? 'ok' : row.status === 'DRAFT' ? 'neutral' : 'info'}
                      label={row.status === 'PUBLISHED' ? 'PUBLICADA' : row.status === 'DRAFT' ? 'BORRADOR' : 'RETIRADA'}
                    />
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <aside className="card h-fit p-5">
            <h3 className="font-display text-sm font-semibold text-ink-900">Reglas de la version</h3>
            <p className="mb-4 mt-1 text-xs text-ink-500">
              Se congelan al publicar: cambiar el ajuste de la empresa no reinterpreta evaluaciones ya presentadas.
            </p>
            {version ? (
              <div className="space-y-3">
                <Field htmlFor="v-score" label="Nota minima (%)">
                  <Input
                    id="v-score"
                    type="number"
                    min={1}
                    max={100}
                    disabled={!isDraft}
                    defaultValue={version.passingScore}
                    onBlur={(event) => void saveSettings('passingScore', Number(event.target.value))}
                  />
                </Field>
                <Field htmlFor="v-attempts" label="Intentos maximos">
                  <Input
                    id="v-attempts"
                    type="number"
                    min={1}
                    max={10}
                    disabled={!isDraft}
                    defaultValue={version.maxAttempts}
                    onBlur={(event) => void saveSettings('maxAttempts', Number(event.target.value))}
                  />
                </Field>
              </div>
            ) : (
              <Skeleton className="h-32 w-full" />
            )}
            {isDraft && activity.versions.length > 1 ? (
              <Button variant="ghost" size="sm" className="mt-4 w-full text-danger" onClick={() => void doDiscardDraft()}>
                Descartar borrador
              </Button>
            ) : null}
          </aside>
        </div>
      ) : null}

      {selectedVersionId ? (
        <AddContentDrawer
          open={addOpen}
          onOpenChange={setAddOpen}
          versionId={selectedVersionId}
          activityId={activityId}
          onAdded={refreshVersion}
        />
      ) : null}

      <Drawer
        open={publishOpen}
        onOpenChange={setPublishOpen}
        title={canPublish ? `Publicar version ${version?.versionNumber ?? ''}` : 'Enviar a aprobacion'}
        description={
          canPublish
            ? 'Publicar congela el contenido. No se puede deshacer.'
            : 'Tu rol no publica directamente: un administrador debe aprobarlo.'
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPublishOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void doPublish()} loading={busy} disabled={!canPublish && justification.trim().length < 10}>
              {canPublish ? 'Publicar y congelar' : 'Enviar solicitud'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-medium text-ink-900">Que pasa con quienes ya la estaban cursando</p>
            <div className="space-y-2">
              {(Object.keys(MIGRATION_LABEL) as MigrationPolicy[]).map((policy) => (
                <label
                  key={policy}
                  className={cn(
                    'flex cursor-pointer gap-3 rounded-lg border p-3 text-sm',
                    migrationPolicy === policy ? 'border-primary bg-primary-soft' : 'border-line-strong',
                  )}
                >
                  <input
                    type="radio"
                    name="migration"
                    checked={migrationPolicy === policy}
                    onChange={() => setMigrationPolicy(policy)}
                    className="mt-0.5 h-4 w-4 accent-[var(--brand-primary)]"
                  />
                  <span>
                    <span className="block font-medium text-ink-900">{MIGRATION_LABEL[policy].title}</span>
                    <span className="block text-ink-500">{MIGRATION_LABEL[policy].detail}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {!canPublish ? (
            <Field htmlFor="p-justification" label="Justificacion" required hint="La lee quien aprueba. Minimo 10 caracteres.">
              <Textarea
                id="p-justification"
                rows={3}
                value={justification}
                onChange={(event) => setJustification(event.target.value)}
              />
            </Field>
          ) : null}

          {publishError ? (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
              {publishError}
            </p>
          ) : null}
        </div>
      </Drawer>
    </div>
  );
}
