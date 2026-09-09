'use client';

import { AlignLeft, Download, FileText, Paperclip, type LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useMediaUrl } from '@/lib/use-media-url';
import { toScore, type EnrollmentContent, type OpenEnrollment } from '@/lib/learner-api';
import { cn } from '@/components/ui/cn';
import { contentMeta } from './course-index';

/**
 * LO QUE VA DEBAJO DEL ESCENARIO.
 *
 * Un video a secas no es una pieza de formacion: es un archivo. Lo que lo convierte en formacion
 * es lo que hay alrededor —de que va, que se exige para darlo por visto, de que norma sale y que
 * material de apoyo lo acompana—, y hasta ahora eso no estaba en ninguna pantalla.
 *
 * Las PESTANAS SON FIJAS y su CONTENIDO es de la pieza que se esta viendo. Es la decision que
 * separa esto de una lista de secciones: si las pestanas aparecieran y desaparecieran segun el
 * tipo de contenido, nadie aprenderia donde esta cada cosa. Si el contenido no cambiara con la
 * pieza, serian datos de la formacion repetidos siete veces.
 *
 * "Material de apoyo" muestra los documentos de TODA la formacion, no solo los de esta parte: la
 * pregunta real que se hace alguien viendo el video de manejo defensivo es "¿donde esta el
 * procedimiento que mencionaron?", y ese procedimiento es otra pieza de la misma formacion.
 */

type TabId = 'resumen' | 'material';

export function ContentTabs({
  description,
  requirement,
  course,
  currentContentId,
  /** El archivo de la pieza actual, cuando lo que se reproduce es una conversion (presentacion). */
  original,
}: {
  description: string | null;
  requirement: ReactNode;
  course: OpenEnrollment | null;
  currentContentId: string;
  original: { storageKey: string; originalName: string } | null;
}) {
  const [tab, setTab] = useState<TabId>('resumen');

  /**
   * LA PESTANA ES FIJA, y su contenido tambien: el material de apoyo es de la FORMACION, no de la
   * pieza. Es la respuesta a "¿por que en el video sale vacia y en la presentacion no?" — porque
   * antes se colaba ahi el archivo original de la pieza actual, y eso hacia que la misma pestana
   * ensenara cosas distintas segun donde estuvieras. Ahora enseña siempre lo mismo, este donde
   * este: los documentos de apoyo de la formacion.
   *
   * El original de la pieza actual se suma solo si el administrador ABRIO la descarga
   * (`config.allowDownload`): una presentacion se convierte para poder medirla, y entregar ademas
   * el archivo de origen es una decision suya, no un efecto colateral.
   */
  const downloadable = (content: EnrollmentContent) =>
    (content.config as { allowDownload?: unknown } | null)?.allowDownload !== false;

  const documents = (course?.contents ?? []).filter(
    (content) => content.type === 'DOCUMENT' && content.file !== null && downloadable(content),
  );
  const current = course?.contents.find((content) => content.id === currentContentId) ?? null;
  const currentOriginal =
    original && current && (current.config as { allowDownload?: unknown } | null)?.allowDownload === true
      ? original
      : null;
  const materialCount = documents.length + (currentOriginal ? 1 : 0);

  return (
    <section className="relative">
      {/*
        SIN linea divisoria. Una raya de borde a borde cortaba la pantalla en dos mitades sin
        relacion; lo que separa aqui es el AIRE y un degradado que se apaga solo. La transicion se
        siente, no se dibuja.
      */}
      <span
        aria-hidden="true"
        className="block h-10 w-full"
        style={{ background: 'linear-gradient(to bottom, color-mix(in srgb, var(--reading-ink) 4%, transparent), transparent)' }}
      />

      {/*
        Alineado a la IZQUIERDA, con el mismo margen que el contenido de arriba. Centrado y
        estrecho dejaba un hueco enorme a la izquierda y las pestanas parecian flotar sin dueno.
      */}
      <div className="w-full px-6 lg:px-10">
        <div role="tablist" aria-label="Detalle de esta parte" className="flex items-center gap-1.5">
          <Tab id="resumen" active={tab} onSelect={setTab} label="Resumen" icon={AlignLeft} />
          <Tab id="material" active={tab} onSelect={setTab} label="Material de apoyo" count={materialCount} icon={Paperclip} />
        </div>

        <div className="max-w-[760px] pb-10 pt-6">
          {tab === 'resumen' ? (
            <div role="tabpanel" id="panel-resumen" className="space-y-6">
              {/*
                Aqui NO se repite el titulo: vive sobre el contenido, que es donde se mira antes de
                darle a reproducir. Repetirlo dos veces en la misma pantalla es ruido.
              */}
              {description ? (
                <p className="text-[17px] leading-[1.7]" style={{ color: 'var(--reading-ink)' }}>
                  {description}
                </p>
              ) : (
                <p className="text-[15px] italic" style={{ color: 'var(--reading-muted)' }}>
                  Esta parte no trae descripcion.
                </p>
              )}

              <Block title="Para darla por vista">{requirement}</Block>

              {/*
                DE DONDE SALE la obligacion. Se dudo si aporta: aporta, y es lo unico de la
                pantalla que responde "¿por que me exigen esto?" —la norma y el proceso solo se
                veian en el panel de administracion—. Lo que no aporta es una tabla de cinco
                filas, asi que va como una linea de etiquetas: se lee de un golpe y no compite con
                la descripcion, que es lo que la persona vino a leer.
              */}
              {course ? (
                <Block title="De donde viene">
                  <div className="flex flex-wrap gap-2">
                    <Tag label="Proceso" value={course.enrollment.processName} />
                    <Tag label="Tipo" value={course.enrollment.activityType.name} />
                    {course.enrollment.normNames.map((norm) => (
                      <Tag key={norm} label="Norma" value={norm} />
                    ))}
                    <Tag label="Version" value={`${course.enrollment.versionNumber}`} />
                    {toScore(course.enrollment.passingScore) ? (
                      <Tag label="Nota minima" value={`${toScore(course.enrollment.passingScore)}%`} />
                    ) : null}
                  </div>
                </Block>
              ) : null}
            </div>
          ) : (
            <div role="tabpanel" id="panel-material" className="space-y-2">
              {materialCount === 0 ? (
                <div className="rounded-xl border border-dashed px-4 py-8 text-center" style={{ borderColor: 'var(--reading-line)' }}>
                  <p className="text-[15px]" style={{ color: 'var(--reading-ink)' }}>
                    Esta formacion no trae material de consulta.
                  </p>
                  <p className="mt-1 text-sm" style={{ color: 'var(--reading-muted)' }}>
                    Si lo hubiera, lo encontrarias aqui en cualquier parte de la formacion.
                  </p>
                </div>
              ) : null}

              {currentOriginal ? (
                <ResourceRow
                  storageKey={currentOriginal.storageKey}
                  name={currentOriginal.originalName}
                  note="El archivo original de esta presentacion"
                />
              ) : null}

              {documents.map((document) => (
                <ResourceRow
                  key={document.id}
                  storageKey={document.file?.storageKey ?? ''}
                  name={document.title}
                  note={contentMeta(document)}
                  current={document.id === currentContentId}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * Pestana como PASTILLA con icono, no como solapa subrayada. El subrayado necesita una linea de
 * borde a borde para apoyarse —la que se acaba de quitar—, y sin ella flotaba. La pastilla se
 * sostiene sola, dice cual esta activa por relleno y no por un pelo de 2px, y el icono la hace
 * reconocible de un vistazo.
 */
function Tab({
  id,
  active,
  onSelect,
  label,
  count,
  icon: Icon,
}: {
  id: TabId;
  active: TabId;
  onSelect: (id: TabId) => void;
  label: string;
  count?: number;
  icon: LucideIcon;
}) {
  const selected = active === id;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      aria-controls={`panel-${id}`}
      onClick={() => onSelect(id)}
      className={cn(
        'focus-ring flex h-10 items-center gap-2 rounded-full px-4 text-sm transition-all duration-150 ease-pulse',
        selected ? 'font-medium shadow-btn-flat' : 'reading-row',
      )}
      style={{
        color: selected ? 'var(--reading-paper)' : 'var(--reading-muted)',
        backgroundColor: selected ? 'var(--brand-primary)' : 'transparent',
      }}
    >
      <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      {label}
      {count ? (
        <span
          className="rounded-full px-1.5 text-[11px] tabular-nums"
          style={{
            backgroundColor: selected ? 'rgb(255 255 255 / 0.2)' : 'color-mix(in srgb, var(--reading-ink) 8%, transparent)',
            color: selected ? 'var(--reading-paper)' : 'var(--reading-muted)',
          }}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3
        className="text-[11px] font-semibold uppercase tracking-[0.08em]"
        style={{ color: 'var(--reading-muted)' }}
      >
        {title}
      </h3>
      <div className="mt-2.5 text-[15px] leading-relaxed" style={{ color: 'var(--reading-ink)' }}>
        {children}
      </div>
    </div>
  );
}

/** Etiqueta de procedencia: el rotulo en gris y el dato en tinta, dentro de la misma pastilla. */
function Tag({ label, value }: { label: string; value: string }) {
  return (
    <span
      className="inline-flex items-baseline gap-1.5 rounded-full border px-3 py-1.5 text-[13px]"
      style={{ borderColor: 'var(--reading-line)' }}
    >
      <span style={{ color: 'var(--reading-muted)' }}>{label}</span>
      <span className="font-medium" style={{ color: 'var(--reading-ink)' }}>
        {value}
      </span>
    </span>
  );
}

/**
 * Un documento del material de apoyo. La firma se resuelve por elemento —una etiqueta no puede
 * autenticarse sola— y hasta tenerla el enlace no se ofrece: es preferible el renglon sin accion
 * a un enlace que da error.
 */
function ResourceRow({
  storageKey,
  name,
  note,
  current = false,
}: {
  storageKey: string;
  name: string;
  note: string;
  current?: boolean;
}) {
  const url = useMediaUrl(storageKey || null);

  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noreferrer"
      aria-disabled={url ? undefined : true}
      className={cn(
        'focus-ring reading-row flex items-center gap-3 rounded-xl px-3 py-3',
        url ? '' : 'pointer-events-none opacity-50',
      )}
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px]"
        style={{
          backgroundColor: 'color-mix(in srgb, var(--reading-ink) 6%, transparent)',
          color: 'var(--reading-muted)',
        }}
      >
        <FileText className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm" style={{ color: 'var(--reading-ink)' }}>
          {name}
          {current ? <span style={{ color: 'var(--reading-muted)' }}> · lo estas viendo</span> : null}
        </span>
        <span className="block truncate text-xs" style={{ color: 'var(--reading-muted)' }}>
          {note}
        </span>
      </span>
      <Download className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" style={{ color: 'var(--reading-muted)' }} />
    </a>
  );
}
