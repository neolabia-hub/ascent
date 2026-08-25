'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
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
  Video,
} from 'lucide-react';
import { ApiError, me } from '@/lib/api';
import {
  addContent,
  createNextVersion,
  discardDraft,
  getActivity,
  getVersion,
  listAssessments,
  listLessons,
  publishVersion,
  removeContent,
  reorderContents,
  updateVersionSettings,
  type ActivityDetail,
  type AssessmentListItem,
  type ContentType,
  type LessonListItem,
  type MigrationPolicy,
  type VersionDetail,
} from '@/lib/catalog-api';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Drawer } from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusPill } from '@/components/ui/status-pill';
import { useToast } from '@/components/ui/toast';

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

export default function ActividadDetallePage() {
  const params = useParams<{ id: string }>();
  const activityId = params.id;
  const { showToast } = useToast();

  const [activity, setActivity] = useState<ActivityDetail | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [version, setVersion] = useState<VersionDetail | null>(null);
  const [busy, setBusy] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [migrationPolicy, setMigrationPolicy] = useState<MigrationPolicy>('MOVE_NOT_STARTED');
  const [publishError, setPublishError] = useState<string | null>(null);
  const [justification, setJustification] = useState('');
  // Quien no tiene catalog:publish (Analista) no publica: envia la solicitud al administrador.
  const [canPublish, setCanPublish] = useState(true);

  const [lessons, setLessons] = useState<LessonListItem[]>([]);
  const [assessments, setAssessments] = useState<AssessmentListItem[]>([]);
  const [newContent, setNewContent] = useState<{
    type: ContentType;
    title: string;
    lessonId: string;
    assessmentVersionId: string;
    externalUrl: string;
    href: string;
    isRequired: boolean;
  }>({ type: 'LESSON', title: '', lessonId: '', assessmentVersionId: '', externalUrl: '', href: '', isRequired: true });

  const loadActivity = useCallback(async () => {
    try {
      const detail = await getActivity(activityId);
      setActivity(detail);
      setSelectedVersionId((current) => {
        if (current && detail.versions.some((v) => v.id === current)) return current;
        const draft = detail.versions.find((v) => v.status === 'DRAFT');
        return draft?.id ?? detail.versions[0]?.id ?? null;
      });
    } catch {
      showToast({ kind: 'danger', title: 'No se pudo cargar la actividad' });
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
    void listLessons('DRAFT').then(setLessons).catch(() => undefined);
    void listAssessments().then(setAssessments).catch(() => undefined);
  }, [addOpen]);

  useEffect(() => {
    void me()
      .then((session) => setCanPublish(session.permissions.includes('catalog:publish')))
      .catch(() => undefined);
  }, []);

  const isDraft = version?.status === 'DRAFT';

  const refreshVersion = async () => {
    if (!selectedVersionId) return;
    setVersion(await getVersion(selectedVersionId));
  };

  const doAddContent = async () => {
    if (!selectedVersionId) return;
    setBusy(true);
    try {
      const config: Record<string, unknown> = {};
      if (newContent.type === 'VIDEO' && newContent.externalUrl) config.externalUrl = newContent.externalUrl;
      if (newContent.type === 'LINK' && newContent.href) config.href = newContent.href;

      await addContent(selectedVersionId, {
        type: newContent.type,
        title: newContent.title.trim(),
        isRequired: newContent.isRequired,
        config,
        lessonId: newContent.type === 'LESSON' ? newContent.lessonId || null : null,
        assessmentVersionId: newContent.type === 'ASSESSMENT' ? newContent.assessmentVersionId || null : null,
      });
      setAddOpen(false);
      setNewContent({ ...newContent, title: '', lessonId: '', assessmentVersionId: '', externalUrl: '', href: '' });
      await refreshVersion();
      showToast({ kind: 'success', title: 'Contenido agregado' });
    } catch {
      showToast({ kind: 'danger', title: 'No se pudo agregar el contenido' });
    } finally {
      setBusy(false);
    }
  };

  const move = async (index: number, direction: -1 | 1) => {
    if (!version) return;
    const ids = version.contents.map((c) => c.id);
    const target = index + direction;
    if (target < 0 || target >= ids.length) return;
    const swapped = [...ids];
    const a = swapped[index] as string;
    swapped[index] = swapped[target] as string;
    swapped[target] = a;
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
        // El analista no publica directo: su solicitud queda esperando al administrador.
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
        title: error instanceof ApiError && error.code === 'LAST_VERSION' ? 'No se puede descartar la unica version.' : 'No se pudo descartar.',
      });
    }
  };

  if (!activity) return <Skeleton className="h-96 w-full" />;

  const publishedVersion = activity.versions.find((v) => v.status === 'PUBLISHED');
  const hasDraft = activity.versions.some((v) => v.status === 'DRAFT');

  return (
    <div>
      <Link href="/contenido-formativo" className="focus-ring mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-700">
        <ArrowLeft size={14} />
        Contenido formativo
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
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
            <Button variant="outline" onClick={doCreateNextVersion} loading={busy}>
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

      {/* Selector de versiones */}
      <div className="mb-4 flex flex-wrap gap-2">
        {activity.versions.map((v) => (
          <button
            key={v.id}
            onClick={() => setSelectedVersionId(v.id)}
            className={cn(
              'focus-ring rounded-md border px-3 py-1.5 text-sm transition-colors duration-150',
              v.id === selectedVersionId ? 'border-[var(--brand-primary)] bg-[var(--brand-primary-soft)] font-medium text-ink-900' : 'border-line text-ink-500 hover:text-ink-700',
            )}
          >
            Version {v.versionNumber}
            <span className="ml-2 text-xs">
              {v.status === 'PUBLISHED' ? 'publicada' : v.status === 'DRAFT' ? 'borrador' : 'retirada'}
            </span>
          </button>
        ))}
      </div>

      {!version ? (
        <Skeleton className="h-80 w-full" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div>
            {!isDraft ? (
              <div className="mb-4 flex items-start gap-2 rounded-lg bg-info-soft px-4 py-3 text-sm text-info">
                <Lock size={16} className="mt-0.5 shrink-0" />
                <p>
                  Esta version esta {version.status === 'PUBLISHED' ? 'publicada' : 'retirada'} y es inmutable: es
                  exactamente lo que vio quien ya la curso. Para cambiar algo, crea una version nueva.
                </p>
              </div>
            ) : null}

            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-ink-900">Contenidos</h2>
              {isDraft ? (
                <Button size="sm" onClick={() => setAddOpen(true)}>
                  <Plus size={14} />
                  Agregar contenido
                </Button>
              ) : null}
            </div>

            {version.contents.length === 0 ? (
              <div className="card">
                <EmptyState
                  icon={Layers}
                  title="Version vacia"
                  description="Agrega lecciones, videos, documentos y la evaluacion final."
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
                          {content.assessmentVersion
                            ? ` · ${content.assessmentVersion.assessment.title} v${content.assessmentVersion.versionNumber}`
                            : ''}
                          {!content.isRequired ? ' · opcional' : ''}
                        </p>
                      </div>
                      {content.type === 'LESSON' && content.lessonId ? (
                        <Link href={`/lecciones/${content.lessonId}`}>
                          <Button variant="ghost" size="sm">
                            {isDraft ? 'Editar' : 'Ver'}
                          </Button>
                        </Link>
                      ) : null}
                      {isDraft ? (
                        <div className="flex items-center gap-0.5">
                          <Button variant="ghost" size="sm" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Subir">
                            <ChevronUp size={14} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => move(index, 1)}
                            disabled={index === version.contents.length - 1}
                            aria-label="Bajar"
                          >
                            <ChevronDown size={14} />
                          </Button>
                          <Button variant="ghost" size="sm" className="text-danger" onClick={() => doRemoveContent(content.id)} aria-label="Eliminar">
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

          {/* Ajustes academicos de la version */}
          <aside className="card h-fit p-4">
            <h3 className="font-display text-sm font-semibold text-ink-900">Ajustes de la version</h3>
            <p className="mb-4 mt-1 text-xs text-ink-500">
              Se congelan al publicar: cambiar el ajuste del tenant no reinterpreta evaluaciones ya presentadas.
            </p>
            <div className="space-y-3">
              <Field htmlFor="v-score" label="Nota minima (%)">
                <Input
                  id="v-score"
                  type="number"
                  min={1}
                  max={100}
                  disabled={!isDraft}
                  defaultValue={version.passingScore}
                  onBlur={(e) => saveSettings('passingScore', Number(e.target.value))}
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
                  onBlur={(e) => saveSettings('maxAttempts', Number(e.target.value))}
                />
              </Field>
            </div>
            <div className="mt-4 border-t border-line pt-3 text-xs text-ink-500">
              <p>
                Estado: <StatusPill kind={version.status === 'PUBLISHED' ? 'ok' : 'neutral'} label={version.status === 'PUBLISHED' ? 'PUBLICADA' : version.status === 'DRAFT' ? 'BORRADOR' : 'RETIRADA'} />
              </p>
              {version.publishedAt ? <p className="mt-2">Publicada el {new Date(version.publishedAt).toLocaleDateString('es-CO')}</p> : null}
            </div>
            {isDraft && activity.versions.length > 1 ? (
              <Button variant="ghost" size="sm" className="mt-3 w-full text-danger" onClick={doDiscardDraft}>
                Descartar borrador
              </Button>
            ) : null}
          </aside>
        </div>
      )}

      {/* Agregar contenido */}
      <Drawer
        open={addOpen}
        onOpenChange={setAddOpen}
        title="Agregar contenido"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAddOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={doAddContent} loading={busy} disabled={newContent.title.trim().length < 2}>
              Agregar
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field htmlFor="c-type" label="Tipo de contenido" required>
            <Select id="c-type" value={newContent.type} onChange={(e) => setNewContent({ ...newContent, type: e.target.value as ContentType })}>
              <option value="LESSON">Leccion en tarjetas</option>
              <option value="VIDEO">Video</option>
              <option value="ASSESSMENT">Evaluacion</option>
              <option value="LINK">Enlace externo</option>
            </Select>
          </Field>
          <Field htmlFor="c-title" label="Titulo" required>
            <Input id="c-title" value={newContent.title} onChange={(e) => setNewContent({ ...newContent, title: e.target.value })} maxLength={200} />
          </Field>

          {newContent.type === 'LESSON' ? (
            <Field htmlFor="c-lesson" label="Leccion" hint="Solo se listan las lecciones editables (en borrador).">
              <Select id="c-lesson" value={newContent.lessonId} onChange={(e) => setNewContent({ ...newContent, lessonId: e.target.value })}>
                <option value="">Seleccionar leccion...</option>
                {lessons.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.title} ({l._count.cards} tarjetas)
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          {newContent.type === 'ASSESSMENT' ? (
            <Field htmlFor="c-assessment" label="Evaluacion">
              <Select
                id="c-assessment"
                value={newContent.assessmentVersionId}
                onChange={(e) => setNewContent({ ...newContent, assessmentVersionId: e.target.value })}
              >
                <option value="">Seleccionar evaluacion...</option>
                {assessments.flatMap((a) =>
                  a.versions
                    .filter((v) => v.status === 'PUBLISHED' || v.status === 'DRAFT')
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        {a.title} — v{v.versionNumber} ({v.status === 'PUBLISHED' ? 'publicada' : 'borrador'})
                      </option>
                    )),
                )}
              </Select>
            </Field>
          ) : null}

          {newContent.type === 'VIDEO' ? (
            <Field htmlFor="c-url" label="URL del video" hint="YouTube o Vimeo. Para subir un archivo, usa una leccion con tarjeta de video.">
              <Input id="c-url" value={newContent.externalUrl} onChange={(e) => setNewContent({ ...newContent, externalUrl: e.target.value })} placeholder="https://" />
            </Field>
          ) : null}

          {newContent.type === 'LINK' ? (
            <Field htmlFor="c-href" label="Enlace">
              <Input id="c-href" value={newContent.href} onChange={(e) => setNewContent({ ...newContent, href: e.target.value })} placeholder="https://" />
            </Field>
          ) : null}

          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={newContent.isRequired}
              onChange={(e) => setNewContent({ ...newContent, isRequired: e.target.checked })}
              className="h-4 w-4 rounded border-line-strong"
            />
            Obligatorio para completar la actividad
          </label>
        </div>
      </Drawer>

      {/* Publicar */}
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
            <Button onClick={doPublish} loading={busy} disabled={!canPublish && justification.trim().length < 10}>
              {canPublish ? 'Publicar y congelar' : 'Enviar solicitud'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-700">
            Al publicar, las lecciones se copian a una version congelada. Quien curse esta version vera siempre lo
            mismo, aunque despues edites el contenido para una version futura.
          </p>

          {!canPublish ? (
            <Field
              htmlFor="publish-justification"
              label="Justificacion"
              required
              hint="Minimo 10 caracteres. La lee el administrador que aprueba."
            >
              <textarea
                id="publish-justification"
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                rows={3}
                maxLength={2000}
                className="focus-ring block w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink-900"
              />
            </Field>
          ) : null}
          <div>
            <p className="mb-2 text-sm font-medium text-ink-900">Que pasa con quienes ya estan inscritos</p>
            <div className="space-y-2">
              {(Object.keys(MIGRATION_LABEL) as MigrationPolicy[]).map((policy) => (
                <label
                  key={policy}
                  className={cn(
                    'flex cursor-pointer gap-3 rounded-md border p-3 transition-colors duration-150',
                    migrationPolicy === policy ? 'border-[var(--brand-primary)] bg-[var(--brand-primary-soft)]' : 'border-line hover:bg-paper',
                  )}
                >
                  <input
                    type="radio"
                    name="migration"
                    checked={migrationPolicy === policy}
                    onChange={() => setMigrationPolicy(policy)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-sm font-medium text-ink-900">{MIGRATION_LABEL[policy].title}</span>
                    <span className="block text-xs text-ink-500">{MIGRATION_LABEL[policy].detail}</span>
                  </span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-ink-500">
              En cualquier caso, quienes ya completaron la actividad conservan su registro intacto.
            </p>
          </div>
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
