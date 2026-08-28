'use client';

import { ArrowLeft, ClipboardCheck, FileText, Layers, Link2, Package, Upload, Video } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ChangeEvent } from 'react';
import {
  addContent,
  createAssessment,
  createLesson,
  listAssessments,
  listQuestionCategories,
  listLessons,
  updateAssessmentDraft,
  uploadMedia,
  type AssessmentListItem,
  type ContentType,
  type LessonListItem,
  type QuestionCategory,
} from '@/lib/catalog-api';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Drawer } from '@/components/ui/drawer';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { useToast } from '@/components/ui/toast';

/**
 * AGREGAR CONTENIDO — sin salir de la formacion.
 *
 * El problema que arregla: antes, para poner una leccion habia que ir a "Lecciones", crearla,
 * volver, y buscarla en un desplegable; y para poner un examen, lo mismo en "Evaluaciones". Dos
 * viajes con el dato en la cabeza. Es el motivo numero uno por el que un autor abandona.
 *
 * Ahora: se elige el tipo, y lo que haga falta se CREA aqui. La biblioteca sigue existiendo para
 * reutilizar (un examen de induccion sirve para varias actividades), pero es la segunda opcion,
 * no el unico camino.
 *
 * Al crear una leccion nueva se entra directo a su editor de tarjetas: es lo unico que se puede
 * querer hacer despues, y el editor sabe volver aqui.
 */

type Mode = 'new' | 'library';

interface TypeMeta {
  type: ContentType;
  label: string;
  description: string;
  icon: typeof Layers;
  disabled?: string;
}

const TYPES: TypeMeta[] = [
  { type: 'LESSON', label: 'Leccion en tarjetas', description: 'El formato principal. De 5 a 15 tarjetas de menos de 5 minutos.', icon: Layers },
  { type: 'DOCUMENT', label: 'Documento', description: 'PDF, Word, Excel o presentacion. Se lee en visor y queda registrada la lectura.', icon: FileText },
  { type: 'VIDEO', label: 'Video', description: 'Archivo subido, o enlace de YouTube o Vimeo. Registra el porcentaje visto.', icon: Video },
  { type: 'ASSESSMENT', label: 'Evaluacion', description: 'Examen con nota, intentos y bloqueo al agotarlos.', icon: ClipboardCheck },
  { type: 'LINK', label: 'Enlace externo', description: 'Un recurso que vive fuera de la plataforma.', icon: Link2 },
  {
    type: 'SURVEY',
    label: 'Encuesta',
    description: 'Satisfaccion o eficacia diferida.',
    icon: ClipboardCheck,
    disabled: 'Llega en el Sprint 5, con el motor de encuestas.',
  },
  {
    type: 'SCORM',
    label: 'Paquete SCORM',
    description: 'Contenido comprado a un tercero.',
    icon: Package,
    disabled: 'Fase 2, y solo si el cliente tiene contenido en ese formato.',
  },
];

export function AddContentDrawer({
  open,
  onOpenChange,
  versionId,
  activityId,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  versionId: string;
  activityId: string;
  onAdded: () => Promise<void>;
}) {
  const router = useRouter();
  const { showToast } = useToast();

  const [type, setType] = useState<ContentType | null>(null);
  const [mode, setMode] = useState<Mode>('new');
  const [title, setTitle] = useState('');
  const [isRequired, setIsRequired] = useState(true);
  const [busy, setBusy] = useState(false);

  const [lessonId, setLessonId] = useState('');
  const [assessmentVersionId, setAssessmentVersionId] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [pickCount, setPickCount] = useState(5);
  const [file, setFile] = useState<File | null>(null);

  const [lessons, setLessons] = useState<LessonListItem[]>([]);
  const [assessments, setAssessments] = useState<AssessmentListItem[]>([]);
  const [categories, setCategories] = useState<QuestionCategory[]>([]);

  useEffect(() => {
    if (!open) return;
    setType(null);
    setMode('new');
    setTitle('');
    setLessonId('');
    setAssessmentVersionId('');
    setExternalUrl('');
    setFile(null);
    setIsRequired(true);
    void listLessons('DRAFT').then(setLessons).catch(() => undefined);
    void listAssessments().then(setAssessments).catch(() => undefined);
    void listQuestionCategories()
      .then((rows) => {
        setCategories(rows);
        setCategoryId((current) => current || (rows[0]?.id ?? ''));
      })
      .catch(() => undefined);
  }, [open]);

  const submit = async () => {
    if (!type) return;
    setBusy(true);
    try {
      const finalTitle = title.trim();
      let newLessonId: string | null = null;

      const body: Parameters<typeof addContent>[1] = { type, title: finalTitle, isRequired, config: {} };

      if (type === 'LESSON') {
        if (mode === 'new') {
          const lesson = await createLesson({ title: finalTitle });
          newLessonId = lesson.id;
          body.lessonId = lesson.id;
        } else {
          body.lessonId = lessonId;
        }
      }

      if (type === 'ASSESSMENT') {
        if (mode === 'new') {
          // Nace en BORRADOR con una seccion aleatoria del banco: es el caso comun y el que
          // evita repetir el mismo examen a todo el mundo. Se afina despues si hace falta.
          const created = await createAssessment(finalTitle);
          const draft = created.versions.find((version) => version.status === 'DRAFT') ?? created.versions[0];
          if (!draft) throw new Error('La evaluacion nacio sin version');
          await updateAssessmentDraft(draft.id, {
            sections: [{ mode: 'RANDOM_FROM_POOL', categoryId, pickCount }],
          });
          body.assessmentVersionId = draft.id;
        } else {
          body.assessmentVersionId = assessmentVersionId;
        }
      }

      if (type === 'DOCUMENT' || (type === 'VIDEO' && file)) {
        if (!file) throw new Error('Falta el archivo');
        const uploaded = await uploadMedia(file, type === 'DOCUMENT' ? 'document' : 'video');
        body.contentPackageId = uploaded.id;
      }

      if (type === 'VIDEO' && !file) body.config = { externalUrl: externalUrl.trim() };
      if (type === 'LINK') body.config = { href: externalUrl.trim() };

      await addContent(versionId, body);
      await onAdded();
      onOpenChange(false);

      if (newLessonId) {
        // Crear una leccion vacia no sirve de nada: lo siguiente es escribir sus tarjetas.
        showToast({ kind: 'success', title: 'Leccion creada', description: 'Ahora escribe sus tarjetas.' });
        router.push(`/lecciones/${newLessonId}?volverA=${encodeURIComponent(`/contenido-formativo/${activityId}`)}`);
        return;
      }
      showToast({ kind: 'success', title: 'Contenido agregado' });
    } catch (error) {
      showToast({
        kind: 'danger',
        title: error instanceof Error && error.message.includes('archivo') ? error.message : 'No se pudo agregar el contenido',
      });
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = (() => {
    if (!type || title.trim().length < 2) return false;
    if (type === 'LESSON') return mode === 'new' || Boolean(lessonId);
    if (type === 'ASSESSMENT') return mode === 'new' ? Boolean(categoryId) : Boolean(assessmentVersionId);
    if (type === 'DOCUMENT') return Boolean(file);
    if (type === 'VIDEO') return Boolean(file) || externalUrl.trim().startsWith('http');
    if (type === 'LINK') return externalUrl.trim().startsWith('http');
    return true;
  })();

  const onFile = (event: ChangeEvent<HTMLInputElement>) => setFile(event.target.files?.[0] ?? null);

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title={type ? 'Agregar contenido' : 'Que quieres agregar'}
      description={type ? undefined : 'Todo se crea aqui mismo. No hace falta salir a otra pantalla.'}
      footer={
        type ? (
          <div className="flex justify-between gap-2">
            <Button variant="ghost" onClick={() => setType(null)} disabled={busy}>
              <ArrowLeft size={16} />
              Cambiar tipo
            </Button>
            <Button onClick={() => void submit()} loading={busy} disabled={!canSubmit}>
              Agregar
            </Button>
          </div>
        ) : undefined
      }
    >
      {!type ? (
        <ul className="space-y-2">
          {TYPES.map((meta) => {
            const Icon = meta.icon;
            return (
              <li key={meta.type}>
                <button
                  type="button"
                  disabled={Boolean(meta.disabled)}
                  onClick={() => setType(meta.type)}
                  className={cn(
                    'focus-ring flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors duration-150',
                    meta.disabled ? 'cursor-not-allowed border-line bg-paper opacity-70' : 'border-line-strong bg-surface hover:border-primary',
                  )}
                >
                  <Icon size={20} className="mt-0.5 shrink-0 text-ink-500" strokeWidth={1.75} />
                  <span className="min-w-0">
                    <span className="block font-medium text-ink-900">{meta.label}</span>
                    <span className="block text-sm text-ink-500">{meta.disabled ?? meta.description}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="space-y-4">
          <Field htmlFor="c-title" label="Titulo" required hint="Es lo que vera el colaborador en la lista.">
            <Input id="c-title" value={title} maxLength={200} onChange={(event) => setTitle(event.target.value)} />
          </Field>

          {(type === 'LESSON' || type === 'ASSESSMENT') && (
            <div role="radiogroup" aria-label="Origen" className="flex gap-1 rounded-md bg-paper p-1">
              {(
                [
                  ['new', type === 'LESSON' ? 'Crear una nueva' : 'Crear una nueva'],
                  ['library', 'Traer de la biblioteca'],
                ] as Array<[Mode, string]>
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={mode === value}
                  onClick={() => setMode(value)}
                  className={cn(
                    'focus-ring h-9 flex-1 rounded-md text-sm transition-colors duration-150',
                    mode === value ? 'bg-surface font-medium text-ink-900 shadow-card' : 'text-ink-500',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          )}

          {type === 'LESSON' && mode === 'new' ? (
            <p className="rounded-md bg-info-soft px-3 py-2 text-sm text-info">
              Al agregarla se abre el editor de tarjetas, y desde ahi se vuelve a esta formacion.
            </p>
          ) : null}

          {type === 'LESSON' && mode === 'library' ? (
            <Field htmlFor="c-lesson" label="Leccion" hint="Solo las que estan en borrador se pueden reutilizar.">
              <Select id="c-lesson" value={lessonId} onChange={(event) => setLessonId(event.target.value)}>
                <option value="">Seleccionar...</option>
                {lessons.map((lesson) => (
                  <option key={lesson.id} value={lesson.id}>
                    {lesson.title} ({lesson._count.cards} tarjetas)
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          {type === 'ASSESSMENT' && mode === 'new' ? (
            <>
              <Field htmlFor="c-category" label="Banco de preguntas" required hint="De donde salen las preguntas.">
                <Select id="c-category" value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                  {categories.length === 0 ? <option value="">No hay categorias todavia</option> : null}
                  {categories.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.name} ({row._count?.questions ?? 0} preguntas)
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                htmlFor="c-pick"
                label="Cuantas preguntas al azar"
                hint="Cada persona recibe una seleccion distinta: repetir el mismo examen lo publica."
              >
                <Input
                  id="c-pick"
                  type="number"
                  min={1}
                  max={50}
                  value={pickCount}
                  onChange={(event) => setPickCount(Number(event.target.value))}
                />
              </Field>
            </>
          ) : null}

          {type === 'ASSESSMENT' && mode === 'library' ? (
            <Field htmlFor="c-assessment" label="Evaluacion">
              <Select
                id="c-assessment"
                value={assessmentVersionId}
                onChange={(event) => setAssessmentVersionId(event.target.value)}
              >
                <option value="">Seleccionar...</option>
                {assessments.flatMap((assessment) =>
                  assessment.versions
                    .filter((version) => version.status === 'PUBLISHED' || version.status === 'DRAFT')
                    .map((version) => (
                      <option key={version.id} value={version.id}>
                        {assessment.title} — v{version.versionNumber} (
                        {version.status === 'PUBLISHED' ? 'publicada' : 'borrador'})
                      </option>
                    )),
                )}
              </Select>
            </Field>
          ) : null}

          {type === 'DOCUMENT' ? (
            <Field htmlFor="c-file" label="Archivo" required hint="PDF, Word, Excel o presentacion.">
              <label
                htmlFor="c-file"
                className="focus-ring flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-line-strong px-4 py-6 text-sm text-ink-500 hover:border-primary"
              >
                <Upload size={18} strokeWidth={1.75} />
                {file ? <span className="text-ink-900">{file.name}</span> : <span>Elegir archivo del computador</span>}
              </label>
              <input id="c-file" type="file" className="sr-only" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx" onChange={onFile} />
            </Field>
          ) : null}

          {type === 'VIDEO' ? (
            <>
              <Field htmlFor="c-video" label="Archivo de video" hint="O deja vacio y pega un enlace abajo.">
                <label
                  htmlFor="c-video"
                  className="focus-ring flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-line-strong px-4 py-6 text-sm text-ink-500 hover:border-primary"
                >
                  <Upload size={18} strokeWidth={1.75} />
                  {file ? <span className="text-ink-900">{file.name}</span> : <span>Subir un video</span>}
                </label>
                <input id="c-video" type="file" className="sr-only" accept="video/*" onChange={onFile} />
              </Field>
              <Field htmlFor="c-url" label="O enlace de YouTube o Vimeo">
                <Input
                  id="c-url"
                  value={externalUrl}
                  disabled={Boolean(file)}
                  placeholder="https://"
                  onChange={(event) => setExternalUrl(event.target.value)}
                />
              </Field>
            </>
          ) : null}

          {type === 'LINK' ? (
            <Field htmlFor="c-href" label="Enlace" required>
              <Input id="c-href" value={externalUrl} placeholder="https://" onChange={(event) => setExternalUrl(event.target.value)} />
            </Field>
          ) : null}

          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={isRequired}
              onChange={(event) => setIsRequired(event.target.checked)}
              className="h-4 w-4 rounded border-line-strong"
            />
            Obligatorio para completar la formacion
          </label>
        </div>
      )}
    </Drawer>
  );
}
