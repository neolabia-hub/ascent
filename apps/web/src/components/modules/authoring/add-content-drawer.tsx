'use client';

import { ArrowLeft, ClipboardCheck, FileText, Layers, Link2, Package, Presentation, Upload, Video } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ChangeEvent } from 'react';
import {
  addContent,
  createAssessment,
  createLesson,
  listAssessments,
  listQuestionCategories,
  presentationCapabilities,
  listLessons,
  updateAssessment,
  uploadMedia,
  uploadPresentation,
  type AssessmentListItem,
  type ContentType,
  type LessonListItem,
  type QuestionCategory,
} from '@/lib/catalog-api';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Drawer } from '@/components/ui/drawer';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
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
  {
    type: 'PRESENTATION',
    label: 'Presentacion',
    description:
      'PowerPoint o PDF. Se convierte en diapositivas y se reproduce dentro de la plataforma: se registra cual vio y cuanto tiempo.',
    icon: Presentation,
  },
  {
    type: 'VIDEO',
    label: 'Video',
    description: 'Archivo subido o enlace de YouTube: se mide lo que la persona ve de verdad. Otros enlaces quedan como declaracion suya.',
    icon: Video,
  },
  { type: 'ASSESSMENT', label: 'Evaluacion', description: 'Examen con nota, intentos y bloqueo al agotarlos.', icon: ClipboardCheck },
  {
    type: 'DOCUMENT',
    label: 'Documento de apoyo',
    description:
      'Manual, politica o instructivo para consultar. No es una leccion: se lee en visor y solo queda la confirmacion de la persona.',
    icon: FileText,
  },
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
  const [description, setDescription] = useState('');
  const [isRequired, setIsRequired] = useState(true);
  const [busy, setBusy] = useState(false);

  const [lessonId, setLessonId] = useState('');
  const [assessmentId, setAssessmentId] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [pickCount, setPickCount] = useState(5);
  const [file, setFile] = useState<File | null>(null);

  const [lessons, setLessons] = useState<LessonListItem[]>([]);
  const [assessments, setAssessments] = useState<AssessmentListItem[]>([]);
  const [categories, setCategories] = useState<QuestionCategory[]>([]);
  /** null mientras no se sabe; false = este servidor solo convierte PDF. */
  const [officeReady, setOfficeReady] = useState<boolean | null>(null);

  useEffect(() => {
    if (!open) return;
    setType(null);
    setMode('new');
    setTitle('');
    setDescription('');
    setLessonId('');
    setAssessmentId('');
    setExternalUrl('');
    setFile(null);
    setIsRequired(true);
    void listLessons('DRAFT').then(setLessons).catch(() => undefined);
    // Se pregunta al abrir: el campo tiene que decir la verdad ANTES de que alguien elija un
    // .pptx que este servidor no va a poder convertir.
    void presentationCapabilities()
      .then((value) => setOfficeReady(value.office))
      .catch(() => setOfficeReady(null));
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

    const body: Parameters<typeof addContent>[1] = {
        type,
        title: finalTitle,
        description: description.trim() || null,
        isRequired,
        config: {},
      };

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
          // Nace con un bloque al azar del banco: es el caso comun y el que evita repetir el
          // mismo examen a todo el mundo. Se afina despues desde su pantalla si hace falta.
          const created = await createAssessment(finalTitle);
          await updateAssessment(created.id, {
            sections: [{ mode: 'RANDOM_FROM_POOL', categoryId, pickCount }],
          });
          body.assessmentId = created.id;
        } else {
          body.assessmentId = assessmentId;
        }
      }

      // La presentacion no se sube: se CONVIERTE. Tarda, y por eso la pantalla lo avisa antes.
      if (type === 'PRESENTATION') {
        if (!file) throw new Error('Falta el archivo');
        const uploaded = await uploadPresentation(file);
        body.contentPackageId = uploaded.id;
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
        router.push(
          `/lecciones/${newLessonId}?volverA=${encodeURIComponent(`/contenido-formativo/${activityId}?tab=contenido`)}&formacion=${activityId}`,
        );
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
    if (type === 'ASSESSMENT') return mode === 'new' ? Boolean(categoryId) : Boolean(assessmentId);
    if (type === 'DOCUMENT' || type === 'PRESENTATION') return Boolean(file);
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

          {/*
            La descripcion la lee quien cursa, en el reproductor, justo debajo del contenido. No
            es la descripcion de la formacion: es de ESTA parte. Sin ella el aprendiz ve un video
            sin saber que va a ver ni por que se lo exigen.
          */}
          <Field
            htmlFor="c-description"
            label="Descripcion"
            hint="De que va esta parte. La lee el colaborador junto al contenido; puedes dejarla vacia."
          >
            <Textarea
              id="c-description"
              rows={3}
              value={description}
              maxLength={2000}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>

          {(type === 'LESSON' || type === 'ASSESSMENT') && (
            <div role="radiogroup" aria-label="Origen" className="flex gap-1 rounded-md bg-paper p-1">
              {(
                [
                  /*
                    «BIBLIOTECA» NO LE DECIA NADA A NADIE (2026-09-09, lo pregunto el cliente).
                    No es un sitio al que se vaya: son las lecciones y las evaluaciones que YA
                    existen en la empresa, que se pueden poner en varias formaciones sin volver a
                    escribirlas. Se dice con esas palabras y se acabo la pregunta.
                  */
                  ['new', 'Crear una nueva'],
                  ['library', type === 'LESSON' ? 'Traer una leccion ya creada' : 'Traer una evaluacion ya creada'],
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
              {/*
                ESTE ES EL ATAJO, NO LA UNICA FORMA.
                Nace con un bloque al azar del banco, que es el caso comun y resuelve en dos clics.
                Pero desde aqui no se puede escribir una pregunta, y eso dejaba INVISIBLE el
                constructor: quien queria diez preguntas concretas no tenia forma de saber que se
                podia. Se dice, y desde la lista de contenidos se entra a armarla.
              */}
              <p className="rounded-md border border-line-strong bg-paper px-3 py-2 text-xs text-ink-500">
                Nace con ese bloque al azar, que resuelve el caso comun. Si quieres escribir preguntas concretas,
                agregala y despues pulsa <strong className="text-ink-700">Armar preguntas</strong> en la lista de
                contenidos: ahi se escriben, se traen del banco y se ordenan.
              </p>
            </>
          ) : null}

          {type === 'ASSESSMENT' && mode === 'library' ? (
            <Field htmlFor="c-assessment" label="Evaluacion">
              <Select
                id="c-assessment"
                value={assessmentId}
                onChange={(event) => setAssessmentId(event.target.value)}
              >
                <option value="">Seleccionar...</option>
                {/*
                  Una evaluacion, una opcion. Antes se ofrecia una por VERSION —"Examen — v2
                  (publicada)"—, que obligaba a elegir entre versiones de la misma cosa sin saber
                  en que se diferencian. Ya no hay versiones que elegir (Decision #87).
                */}
                {assessments.map((assessment) => (
                  <option key={assessment.id} value={assessment.id}>
                    {assessment.title}
                    {assessment._count.sections === 0 ? ' — sin preguntas todavia' : ''}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          {type === 'PRESENTATION' ? (
            <>
              <Field
                htmlFor="c-slides"
                label="Presentacion"
                required
                hint={
                  officeReady === false
                    ? 'Este servidor solo acepta PDF. Exportala desde PowerPoint (Archivo, Guardar como, PDF): el resultado es identico.'
                    : 'PowerPoint (.pptx, .ppt), OpenDocument (.odp) o PDF.'
                }
              >
                <label
                  htmlFor="c-slides"
                  className="focus-ring flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-line-strong px-4 py-6 text-sm text-ink-500 hover:border-primary"
                >
                  <Upload size={18} strokeWidth={1.75} />
                  {file ? <span className="text-ink-900">{file.name}</span> : <span>Elegir la presentacion</span>}
                </label>
                <input
                  id="c-slides"
                  type="file"
                  className="sr-only"
                  accept={officeReady === false ? '.pdf' : '.pdf,.ppt,.pptx,.odp'}
                  onChange={onFile}
                />
              </Field>
              {/*
                Se advierte ANTES de subir, no despues: quien elige este formato tiene que saber
                que pierde, y que a cambio la plataforma puede registrar que se vio.
              */}
              <p className="rounded-md bg-info-soft px-3 py-2 text-sm text-info">
                Cada diapositiva se convierte en una imagen y se reproduce dentro de la plataforma, asi que queda registrado
                cual vio cada persona y cuanto tiempo. Se pierden las animaciones, los videos incrustados y los
                hipervinculos. La conversion tarda unos segundos.
              </p>
            </>
          ) : null}

          {type === 'DOCUMENT' ? (
            <Field
              htmlFor="c-file"
              label="Archivo"
              required
              ayuda="Manual, politica o instructivo. Si lo que quieres es que lo CURSEN, usa Presentacion o Leccion: de un documento solo se registra que la persona confirmo haberlo leido."
            >
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
              <Field
                htmlFor="c-url"
                label="O enlace de YouTube o Vimeo"
                ayuda="De YouTube se mide lo reproducido, igual que de un archivo propio. De Vimeo y del resto no: quedan como declaracion de la persona."
              >
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
