'use client';

import { useEffect, useState } from 'react';
import { Upload } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { updateContent, uploadMedia, type VersionContent } from '@/lib/catalog-api';
import { Button } from '@/components/ui/button';
import { Drawer } from '@/components/ui/drawer';
import { Field } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';

/**
 * EDITAR UNA PARTE DE LA FORMACION.
 *
 * Antes solo se podia editar una leccion: el video, el documento, el enlace y la evaluacion se
 * agregaban y ya. Corregir el titulo, cambiar un archivo por otro o ajustar cuanto hay que ver
 * de un video obligaba a BORRAR la parte y volver a crearla, perdiendo su sitio en el orden.
 *
 * El backend siempre lo soporto (`PATCH /activities/contents/:id`): lo que faltaba era esto.
 *
 * Solo se abre sobre un BORRADOR. Sobre una version publicada no existe, y no por precaucion:
 * cambiarla reescribiria lo que ya curso alguien.
 */

const MIN_WATCH_DEFAULT = 90;

export function EditContentDrawer({
  content,
  open,
  onOpenChange,
  onSaved,
}: {
  content: VersionContent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void> | void;
}) {
  const { showToast } = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isRequired, setIsRequired] = useState(true);
  const [allowDownload, setAllowDownload] = useState(false);
  const [minWatchPct, setMinWatchPct] = useState(String(MIN_WATCH_DEFAULT));
  const [minSeconds, setMinSeconds] = useState('');
  const [externalUrl, setExternalUrl] = useState('');
  const [href, setHref] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  // Al abrir se parte SIEMPRE de lo que hay guardado: un formulario que conserva lo tecleado la
  // vez anterior haria creer que el cambio se guardo cuando no fue asi.
  useEffect(() => {
    if (!content || !open) return;
    const config = content.config as { minWatchPct?: unknown; minSeconds?: unknown; externalUrl?: unknown; href?: unknown };
    setTitle(content.title);
    setAllowDownload(
      (content.config as { allowDownload?: unknown } | null)?.allowDownload === true ||
        (content.type === 'DOCUMENT' &&
          (content.config as { allowDownload?: unknown } | null)?.allowDownload !== false),
    );
    setDescription(content.description ?? '');
    setIsRequired(content.isRequired);
    setMinWatchPct(String(typeof config.minWatchPct === 'number' ? config.minWatchPct : MIN_WATCH_DEFAULT));
    setMinSeconds(typeof config.minSeconds === 'number' ? String(config.minSeconds) : '');
    setExternalUrl(typeof config.externalUrl === 'string' ? config.externalUrl : '');
    setHref(typeof config.href === 'string' ? config.href : '');
    setFile(null);
  }, [content, open]);

  if (!content) return null;

  const isVideo = content.type === 'VIDEO';
  const isDocument = content.type === 'DOCUMENT';
  const isLink = content.type === 'LINK';
  const isLesson = content.type === 'LESSON';

  const titleValid = title.trim().length >= 2 && title.length <= 200;
  // Un video ENLAZADO no puede quedarse sin enlace ni sin archivo: seria una parte que no muestra
  // nada, y publicar la rechazaria mas adelante con un error que aqui todavia se puede evitar.
  const videoHasSource = !isVideo || Boolean(file) || Boolean(content.contentPackageId) || externalUrl.trim().length > 0;
  const linkValid = !isLink || href.trim().startsWith('http');
  const canSave = titleValid && videoHasSource && linkValid && !busy;

  const save = async () => {
    setBusy(true);
    try {
      let contentPackageId: string | undefined;
      if (file) {
        const uploaded = await uploadMedia(file, isVideo ? 'video' : 'document');
        contentPackageId = uploaded.id;
      }

      // El `config` se manda ENTERO: el servidor lo reemplaza, no lo mezcla. Mandar solo el campo
      // tocado borraria los demas en silencio.
      const config: Record<string, unknown> = {};
      // Se manda SIEMPRE, tambien en false: es lo que distingue "el admin dijo que no" de "nadie lo
      // ha decidido", y de eso depende que se ofrezca o no el archivo original.
      if (content.type === 'PRESENTATION' || content.type === 'DOCUMENT') config.allowDownload = allowDownload;
      if (isVideo) {
        config.minWatchPct = clampPct(minWatchPct);
        // Si se subio un archivo ahora, el enlace externo sobra: la parte pasa a ser medible.
        if (!file && !contentPackageId && externalUrl.trim()) config.externalUrl = externalUrl.trim();
      }
      if ((isDocument || isLesson) && minSeconds.trim()) {
        const seconds = Number(minSeconds);
        if (Number.isFinite(seconds) && seconds > 0) config.minSeconds = Math.round(seconds);
      }
      if (isLink) config.href = href.trim();

      await updateContent(content.id, {
        title: title.trim(),
        description: description.trim() || null,
        isRequired,
        config,
        ...(contentPackageId ? { contentPackageId } : {}),
      });
      showToast({ kind: 'success', title: 'Contenido actualizado' });
      onOpenChange(false);
      await onSaved();
    } catch (error) {
      showToast({
        kind: 'danger',
        title: error instanceof ApiError ? error.message : 'No se pudo actualizar el contenido',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Editar contenido"
      description="Los cambios viven en el borrador; nadie los ve hasta publicar la version."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void save()} disabled={!canSave} loading={busy}>
            Guardar cambios
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field htmlFor="ec-title" label="Titulo" required hint="Es lo que ve la persona en el indice de la formacion.">
          <Input id="ec-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} />
        </Field>

        <Field
          htmlFor="ec-description"
          label="Descripcion"
          hint="De que va esta parte. La lee el colaborador junto al contenido; puedes dejarla vacia."
        >
          <Textarea
            id="ec-description"
            rows={3}
            value={description}
            maxLength={2000}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>

        {(content.type === 'PRESENTATION' || content.type === 'DOCUMENT') ? (
          <label className="flex items-start gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={allowDownload}
              onChange={(event) => setAllowDownload(event.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-line-strong"
            />
            <span>
              Se puede descargar el archivo original
              <span className="mt-0.5 block text-xs text-ink-500">Una presentacion se reproduce convertida en diapositivas. Marca esto solo si ademas quieres entregar el archivo tal como llego.</span>
            </span>
          </label>
        ) : null}
        <label className="flex items-start gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            checked={isRequired}
            onChange={(event) => setIsRequired(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-line-strong"
          />
          <span>
            Obligatorio para terminar la formacion
            <span className="block text-xs text-ink-500">
              Si lo quitas, la persona puede completar la formacion sin pasar por aqui.
            </span>
          </span>
        </label>

        {isVideo ? (
          <>
            <Field
              htmlFor="ec-pct"
              label="Minimo visto para darlo por hecho"
              ayuda="Se cuentan los segundos distintos reproducidos: adelantar no suma. Con un video de otra plataforma que no se pueda medir, queda como declaracion de la persona."
            >
              <Input
                id="ec-pct"
                type="number"
                min={1}
                max={100}
                value={minWatchPct}
                onChange={(event) => setMinWatchPct(event.target.value)}
              />
            </Field>

            {content.contentPackage ? (
              <p className="text-sm text-ink-500">
                Archivo actual: <span className="text-ink-900">{content.contentPackage.originalName}</span>
              </p>
            ) : null}

            <Field htmlFor="ec-file" label="Reemplazar el archivo" hint="Opcional. Al subir otro, el anterior deja de usarse aqui.">
              <label
                htmlFor="ec-file"
                className="focus-ring flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-line-strong px-4 py-5 text-sm text-ink-500 hover:border-primary"
              >
                <Upload size={18} strokeWidth={1.75} />
                {file ? <span className="text-ink-900">{file.name}</span> : <span>Subir otro video</span>}
              </label>
              <input
                id="ec-file"
                type="file"
                className="sr-only"
                accept="video/*"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </Field>

            {!content.contentPackageId && !file ? (
              <Field htmlFor="ec-url" label="Enlace de YouTube o Vimeo" hint="De YouTube se mide lo reproducido; del resto no.">
                <Input id="ec-url" value={externalUrl} onChange={(event) => setExternalUrl(event.target.value)} placeholder="https://" />
              </Field>
            ) : null}
          </>
        ) : null}

        {isDocument ? (
          <>
            {content.contentPackage ? (
              <p className="text-sm text-ink-500">
                Archivo actual: <span className="text-ink-900">{content.contentPackage.originalName}</span>
              </p>
            ) : null}
            <Field htmlFor="ec-doc" label="Reemplazar el archivo" hint="Opcional.">
              <label
                htmlFor="ec-doc"
                className="focus-ring flex cursor-pointer items-center gap-3 rounded-md border border-dashed border-line-strong px-4 py-5 text-sm text-ink-500 hover:border-primary"
              >
                <Upload size={18} strokeWidth={1.75} />
                {file ? <span className="text-ink-900">{file.name}</span> : <span>Subir otro documento</span>}
              </label>
              <input
                id="ec-doc"
                type="file"
                className="sr-only"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </Field>
          </>
        ) : null}

        {isLink ? (
          <Field htmlFor="ec-href" label="Destino" required>
            <Input id="ec-href" value={href} onChange={(event) => setHref(event.target.value)} placeholder="https://" />
          </Field>
        ) : null}

        {isDocument || isLesson ? (
          <Field
            htmlFor="ec-seconds"
            label="Tiempo minimo en pantalla (segundos)"
            hint="Freno al click siguiente. Dejalo vacio para no exigir tiempo."
          >
            <Input
              id="ec-seconds"
              type="number"
              min={0}
              value={minSeconds}
              onChange={(event) => setMinSeconds(event.target.value)}
            />
          </Field>
        ) : null}

        {content.type === 'ASSESSMENT' ? (
          <p className="rounded-md bg-info-soft px-3 py-2 text-sm text-info">
            Las preguntas y la nota minima de la evaluacion se editan desde la evaluacion. Aqui solo cambian su titulo en el
            indice y si es obligatoria.
          </p>
        ) : null}
      </div>
    </Drawer>
  );
}

function clampPct(value: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return MIN_WATCH_DEFAULT;
  return Math.min(100, Math.max(1, Math.round(parsed)));
}
