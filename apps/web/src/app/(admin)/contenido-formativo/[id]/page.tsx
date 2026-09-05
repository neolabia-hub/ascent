'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
  Pencil,
  Plus,
  Presentation,
  Trash2,
  Users,
  Video,
} from 'lucide-react';
import { ApiError, me, motivoDelError } from '@/lib/api';
import {
  createNextVersion,
  discardDraft,
  getActivity,
  deleteActivity,
  getVersion,
  publishVersion,
  removeContent,
  reorderContents,
  updateVersionSettings,
  type ActivityDetail,
  type ContentType,
  type MigrationPolicy,
  type VersionContent,
  type VersionDetail,
  updateActivity,
  uploadMedia,
} from '@/lib/catalog-api';
import { loQueExigeElTipo, quienDecide, readTypeConfig } from '@/lib/activity-type';
import { ActivityCover } from '@/components/modules/activity-cover';
import { ActivityPlanCard } from '@/components/modules/delivery/activity-plan-card';
import { ActivityAudienceTab } from '@/components/modules/authoring/activity-audience-tab';
import { ActivityInfoTab } from '@/components/modules/authoring/activity-info-tab';
import { ActivityScheduleTab } from '@/components/modules/authoring/activity-schedule-tab';
import { AddContentDrawer } from '@/components/modules/authoring/add-content-drawer';
import { EditContentDrawer } from '@/components/modules/authoring/edit-content-drawer';
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
  PRESENTATION: { label: 'Presentacion', icon: Presentation },
  DOCUMENT: { label: 'Documento de apoyo', icon: FileText },
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

/**
 * La pestana se llama CONVOCATORIAS, igual que el modulo, y no "Programacion".
 *
 * Eran dos nombres para la misma cosa —lo que el glosario existe para evitar—: quien lee
 * "Programacion" aqui y "Convocatorias" en el menu se pregunta si son cosas distintas. La clave
 * interna se queda en 'programacion' a proposito: es la que viaja en `?tab=` y cambiarla
 * romperia los enlaces que ya existan.
 */
type TabKey = 'info' | 'contenido' | 'quienes' | 'programacion' | 'versiones';

const TABS: Array<{ key: TabKey; label: string; icon: typeof FileText }> = [
  { key: 'info', label: 'Ficha', icon: FileText },
  { key: 'contenido', label: 'Contenido', icon: Layers },
  { key: 'quienes', label: 'Quienes', icon: Users },
  { key: 'programacion', label: 'Convocatorias', icon: CalendarDays },
  { key: 'versiones', label: 'Versiones', icon: Package },
];

/**
 * LO QUE FALTA PARA PUBLICAR, dicho ANTES de pulsar y nombrando cada pieza.
 *
 * El servidor ya validaba esto y devolvia hasta los titulos de los contenidos incompletos
 * (`items`), pero la pantalla los tiraba y mostraba una frase generica DESPUES de intentarlo. Con
 * siete piezas en una formacion, "hay contenidos sin material asignado" obliga a abrirlas una por
 * una para encontrar cual.
 *
 * Repite la regla del servidor a proposito (`isContentComplete` en `versioning.service.ts`): aqui
 * sirve para GUIAR, alli para DECIDIR. Si alguna vez discrepan, manda el servidor y el error
 * detallado sigue apareciendo igual.
 */
function loQueFaltaParaPublicar(contents: VersionContent[]): string[] {
  if (contents.length === 0) return ['Agrega al menos un contenido: una version vacia no se publica.'];

  const completo = (content: VersionContent): boolean => {
    const config = content.config as { externalUrl?: string; href?: string };
    switch (content.type) {
      case 'LESSON':
        return Boolean(content.lessonId);
      case 'VIDEO':
        return Boolean(content.contentPackageId) || Boolean(config.externalUrl);
      case 'PRESENTATION':
      case 'DOCUMENT':
      case 'SCORM':
        return Boolean(content.contentPackageId);
      case 'ASSESSMENT':
        return Boolean(content.assessmentId);
      case 'SURVEY':
        return Boolean(content.surveyTemplateId);
      case 'LINK':
        return Boolean(config.href);
      default:
        return false;
    }
  };

  return contents
    .filter((content) => !completo(content))
    .map((content) => `"${content.title}" no tiene su material asignado.`);
}

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
  const [editing, setEditing] = useState<VersionContent | null>(null);
  const [publishOpen, setPublishOpen] = useState(false);
  /** Confirmacion de borrado: eliminar una formacion no puede ser un clic suelto. */
  const [borrarOpen, setBorrarOpen] = useState(false);
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
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo cargar la formacion', description: motivoDelError(error) });
    }
  }, [activityId, showToast]);

  useEffect(() => {
    void loadActivity();
  }, [loadActivity]);

  useEffect(() => {
    if (!selectedVersionId) return;
    setVersion(null);
    void getVersion(selectedVersionId)
      .then(setVersion)
      // Se avisa en vez de tragarselo: un fallo silencioso aqui dejaba la pestana de contenido
      // cargando para siempre y sin explicacion.
      .catch(() => showToast({ kind: 'danger', title: 'No se pudo cargar el contenido de esta version' }));
  }, [selectedVersionId, showToast]);

  useEffect(() => {
    void me()
      .then((session) => setCanPublish(session.permissions.includes('catalog:publish')))
      .catch(() => undefined);
  }, []);

  /**
   * El estado de la version sale del LISTADO que ya trae la actividad, no del detalle que se
   * pide aparte.
   *
   * Antes dependia de `version`, que es una segunda peticion: si esa peticion iba lenta o
   * fallaba, `version` se quedaba en null y desaparecian LOS DOS botones de la cabecera —
   * "Publicar version" y "Nueva version"—, dejando la pantalla sin ninguna accion posible y sin
   * decir por que. Las acciones principales no pueden depender de una peticion secundaria.
   */
  const selectedSummary = activity?.versions.find((row) => row.id === selectedVersionId) ?? null;
  const isDraft = selectedSummary?.status === 'DRAFT';
  /** Publicar esto la exige sola a toda la empresa: hay que decirlo ANTES. */
  const seExigiraSola =
    activity !== null && quienDecide(readTypeConfig(activity.activityType.config)) === 'TODOS';
  /** Una induccion de INGRESO no alcanza a quien ya lleva anos: su induccion se hizo al entrar. */
  const esInduccionDeIngreso =
    activity !== null && readTypeConfig(activity.activityType.config).requiresBeforeHire;

  /** Lo que impide publicar HOY. Vacio = se puede publicar. */
  const faltaParaPublicar = version ? loQueFaltaParaPublicar(version.contents) : [];
  /**
   * Lo que el TIPO pide y esta version no trae. NO impide publicar —el tenant todavia no puede
   * cambiar ese config desde la interfaz, asi que convertirlo en muro dejaria encerrado a quien
   * no lo comparta (Decision #74)— pero se dice antes de pulsar, y el servidor lo deja en la
   * auditoria. Lo que estaba roto no era que se pudiera publicar sin examen: era que nadie lo
   * mencionara nunca.
   */
  const loQuePideElTipo =
    activity && version
      ? loQueExigeElTipo(activity.activityType.config, version.contents)
      : [];

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
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo reordenar', description: motivoDelError(error) });
    }
  };

  const doRemoveContent = async (contentId: string) => {
    try {
      await removeContent(contentId);
      await refreshVersion();
      showToast({ kind: 'success', title: 'Contenido eliminado' });
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo eliminar el contenido', description: motivoDelError(error) });
    }
  };

  const saveSettings = async (field: 'passingScore' | 'maxAttempts', value: number) => {
    if (!version) return;
    try {
      await updateVersionSettings(version.id, { [field]: value });
      await refreshVersion();
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo guardar el ajuste', description: motivoDelError(error) });
    }
  };


  /**
   * ELIMINAR LA FORMACION. El servidor ya lo permitia y ninguna pantalla lo llamaba —el mismo
   * agujero que tenia corregir una convocatoria—: una formacion creada por error se quedaba en el
   * catalogo para siempre.
   *
   * No borra: la marca como borrada, asi que el historico de quien la curso sigue en pie. Y se
   * niega si tiene convocatorias, porque ahi hay gente citada: eso se desactiva, no se elimina.
   */
  const eliminarFormacion = async () => {
    if (!activity) return;
    setBusy(true);
    try {
      await deleteActivity(activity.id);
      showToast({ kind: 'success', title: 'Formacion eliminada' });
      router.push('/contenido-formativo');
    } catch (error) {
      showToast({
        kind: 'danger',
        title:
          error instanceof ApiError && error.code === 'ACTIVITY_IN_USE'
            ? 'Tiene convocatorias: no se puede eliminar'
            : 'No se pudo eliminar',
        description:
          error instanceof ApiError && error.code === 'ACTIVITY_IN_USE'
            ? 'Hay gente citada o inscrita. Cancela sus convocatorias primero, o desactivala.'
            : undefined,
      });
      setBorrarOpen(false);
    } finally {
      setBusy(false);
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
        // Cada motivo con su frase, y la del examen incluida: `NOT_ENOUGH_QUESTIONS` no estaba en
        // el mapa, asi que una seccion aleatoria que pedia mas preguntas de las que hay salia con
        // el mensaje crudo del servidor.
        const map: Record<string, string> = {
          VERSION_EMPTY: 'La version necesita al menos un contenido.',
          CONTENT_INCOMPLETE: 'Hay contenidos sin material asignado. Completalos antes de publicar.',
          NOT_ENOUGH_QUESTIONS:
            'Una seccion del examen pide mas preguntas de las que hay en su categoria. Agrega preguntas o baja cuantas pide.',
          VERSION_NOT_DRAFT: 'Esta version ya esta publicada. Para cambiar algo, crea una nueva.',
        };
        setPublishError(map[error.code] ?? `No se pudo publicar (${error.code}).`);
      } else {
        setPublishError('No se pudo publicar: no hubo respuesta del servidor.');
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
      {/*
        Se vuelve por DONDE SE VINO. Quien llego aqui desde el plan a crear una capacitacion tiene
        que poder regresar cuando la publique, sin acordarse de la ruta ni pasar por el listado.
      */}
      <Link
        href={searchParams.get('volverA') ?? '/contenido-formativo'}
        className="focus-ring mb-4 inline-flex items-center gap-1 text-sm text-ink-500 hover:text-ink-700"
      >
        <ArrowLeft size={14} />
        {searchParams.get('volverA')?.startsWith('/plan') ? 'Volver al plan' : 'Formaciones'}
      </Link>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 gap-4">
          {/*
            LA PORTADA, al lado del nombre (Decision #88). Es lo que ve el empleado en "Hoy", asi
            que ponerla en una pestana de ajustes seria esconder la cara de la formacion. Debajo
            hay SIEMPRE una portada generada, asi que esto no es un campo obligatorio: es una
            mejora, y por eso se ofrece sin asterisco y se puede quitar.
          */}
          <PortadaFormacion
            activityId={activity.id}
            seed={activity.id}
            coverKey={activity.coverKey}
            colorHex={activity.activityType.colorHex}
            onChange={(coverKey) => setActivity((previa) => (previa ? { ...previa, coverKey } : previa))}
          />
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
            {/*
              SI ESTA EN BORRADOR O PUBLICADA, ARRIBA Y EN DOS PALABRAS.
              Lo unico que lo decia era "Editando la version 1 en borrador", dentro de la pestana
              Contenido: quien no entraba ahi no tenia forma de saber si su formacion ya existia
              para la gente o seguia siendo un borrador que no ve nadie. Es el dato que mas cambia
              lo que significa todo lo demas de la pantalla, asi que va junto al nombre.
            */}
            {/*
              UNA sola pastilla, y corta. El estado es el de la FORMACION y no el de la version que
              se este mirando: lo que alguien necesita saber al entrar es si esto ya existe para la
              gente.
              Aqui llego a haber una segunda —"CON CAMBIOS SIN PUBLICAR"— y sobraba: cuando eso es
              cierto, al lado hay un boton que dice "Descartar cambios" y otro "Publicar cambios".
              Decir lo mismo dos veces en la misma linea no informa mas, solo llena.
            */}
            <StatusPill
              kind={publishedVersion ? 'ok' : 'warn'}
              label={publishedVersion ? `PUBLICADA v${publishedVersion.versionNumber}` : 'EN BORRADOR'}
            />
          </div>
          <p className="mt-1 font-mono text-xs text-ink-500">
            {activity.code} · {activity.process.name}
          </p>
          {/*
            Y lo que ese estado SIGNIFICA, en una linea. "Borrador" a secas no dice lo que importa:
            que todavia no lo ve nadie y que no se puede convocar.
          */}
          <p className="mt-1 text-xs text-ink-500">
            {publishedVersion
              ? hasDraft
                ? 'La gente cursa la version publicada. Los cambios en curso no la afectan hasta publicarlos.'
                : 'La gente ya puede cursarla y se puede programar en convocatorias.'
              : 'Todavia no la ve nadie y no se puede programar. Se publica cuando este lista.'}
          </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {publishedVersion && !hasDraft ? (
            <Button variant="outline" onClick={() => void doCreateNextVersion()} loading={busy}>
              <Pencil size={16} />
              Editar el contenido
            </Button>
          ) : null}
          {/*
            DESCARTAR EL BORRADOR, AQUI. Estaba abajo del todo, en la columna lateral, donde no lo
            veia nadie: la accion opuesta a publicar tiene que estar al lado de publicar.
          */}
          {isDraft && activity.versions.length > 1 ? (
            <Button variant="ghost" className="text-danger" onClick={() => void doDiscardDraft()} disabled={busy}>
              <Trash2 size={16} />
              Descartar cambios
            </Button>
          ) : null}
          {isDraft ? (
            // NO SE BLOQUEA. Un boton apagado que no dice por que es un callejon sin salida:
            // se pasa el raton por encima y no pasa nada. Se deja pulsable y el dialogo dice
            // exactamente que falta —"Bienvenida no tiene su material asignado"—, que es la
            // informacion que hace falta para arreglarlo.
            <Button onClick={() => setPublishOpen(true)}>
              {canPublish ? 'Publicar cambios' : 'Enviar a aprobacion'}
            </Button>
          ) : null}
          <Button variant="ghost" className="text-danger" onClick={() => setBorrarOpen(true)} disabled={busy}>
            <Trash2 size={16} />
            Eliminar
          </Button>
        </div>
      </div>

      {/*
        VA ARRIBA DE LAS PESTANAS, no dentro de una. Si estuviera en "Programacion" solo lo veria
        quien ya sabe que tiene que ir ahi, y el problema es justo el contrario: quien crea una
        capacitacion del plan cree que con crearla ya cuenta para el plan.
      */}
      <ActivityPlanCard
        activityId={activity.id}
        typeConfig={readTypeConfig(activity.activityType.config)}
        publishedVersion={
          publishedVersion ? { id: publishedVersion.id, versionNumber: publishedVersion.versionNumber } : null
        }
      />

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

      {tab === 'quienes' ? (
        <ActivityAudienceTab
          activityId={activity.id}
          activityName={activity.name}
          typeConfig={readTypeConfig(activity.activityType.config)}
          hayContenidoPublicado={publishedVersion !== undefined}
        />
      ) : null}

      {tab === 'programacion' ? (
        <ActivityScheduleTab
          activityId={activity.id}
          publishedVersionId={publishedVersion?.id ?? null}
          draftVersionId={activity.versions.find((row) => row.status === 'DRAFT')?.id ?? null}
          activityModality={activity.modality}
          typeConfig={readTypeConfig(activity.activityType.config)}
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
                          {content.assessment ? ` · ${content.assessment.title}` : ''}
                          {!content.isRequired ? ' · opcional' : ''}
                        </p>
                      </div>
                      {/*
                        EDITAR, para cualquier tipo. Antes solo la leccion tenia como abrirse: el
                        video, el documento, el enlace y la evaluacion habia que BORRARLOS y
                        volver a crearlos para corregir un titulo, y eso ademas les cambiaba el
                        sitio en el orden.
                      */}
                      {isDraft ? (
                        <Button variant="ghost" size="sm" onClick={() => setEditing(content)}>
                          Editar
                        </Button>
                      ) : null}
                      {content.type === 'LESSON' && content.lessonId ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            router.push(
                              // `formacion` va aparte de `volverA`: con ella, una leccion ya
                              // publicada puede ofrecer lo que resuelve el problema (crear la
                              // version siguiente) en vez de una copia suelta en la biblioteca.
                              `/lecciones/${content.lessonId}?volverA=${encodeURIComponent(`/contenido-formativo/${activityId}?tab=contenido`)}&formacion=${activityId}`,
                            )
                          }
                        >
                          {isDraft ? 'Editar tarjetas' : 'Ver'}
                        </Button>
                      ) : null}
                      {/*
                        LA EVALUACION SE ABRE DESDE AQUI, igual que una leccion.
                        Faltaba, y era lo que dejaba invisible el constructor: desde el contenido de
                        una formacion solo se podia ELEGIR una evaluacion de un desplegable, asi que
                        para escribirle las preguntas habia que salirse al modulo, buscarla por
                        nombre entre todas y volver. Se va con `volverA`, como todo lo demas.
                      */}
                      {content.type === 'ASSESSMENT' && content.assessment ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            router.push(
                              `/evaluaciones/${content.assessment?.sourceId ?? content.assessment?.id}?volverA=${encodeURIComponent(`/contenido-formativo/${activityId}?tab=contenido`)}`,
                            )
                          }
                        >
                          {isDraft ? 'Armar preguntas' : 'Ver evaluacion'}
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

      <EditContentDrawer
        content={editing}
        open={editing !== null}
        onOpenChange={(open) => { if (!open) setEditing(null); }}
        onSaved={refreshVersion}
      />

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
            <Button
              onClick={() => void doPublish()}
              loading={busy}
              disabled={faltaParaPublicar.length > 0 || (!canPublish && justification.trim().length < 10)}
            >
              {canPublish ? 'Publicar y congelar' : 'Enviar solicitud'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {/*
            LO QUE PUBLICAR VA A PROVOCAR, dicho ANTES de pulsar, y sin preguntar nada.

            Que ocurra sin decirlo convertiria una decision correcta en magia: el usuario ve
            aparecer obligaciones y no sabe quien las creo. Pero tampoco se pregunta: a quien
            alcanza lo decide el TIPO —una induccion es parte del ingreso y no se le exige a quien
            lleva anos; una reinduccion es la obligacion anual de todos—, y pedirle al usuario que
            decida lo que el sistema ya sabe es una pregunta en la que se puede acertar mal.
          */}
          {seExigiraSola ? (
            <div className="rounded-lg border border-info bg-info-soft px-4 py-3">
              <p className="text-sm font-medium text-info">
                {esInduccionDeIngreso
                  ? 'Al publicar se exigira a quien entre desde ahora'
                  : 'Al publicar quedara exigida a toda la empresa'}
              </p>
              <p className="mt-1 text-sm text-ink-700">
                {esInduccionDeIngreso
                  ? 'Es una induccion de ingreso: cada persona que entre a partir de hoy la tendra automaticamente, y vencera el dia antes de su fecha de ingreso. A quien ya lleva tiempo en la empresa NO se le exige, porque no esta ingresando: su induccion se hizo cuando entro. Lo que le toca cada ano es la reinduccion, que es otra formacion.'
                  : 'Se le exige a todo el mundo, tambien a quien ya esta, y a quien entre despues. A la plantilla actual se le dan 30 dias de plazo.'}{' '}
                Se puede ajustar o retirar en Quienes.
              </p>
            </div>
          ) : null}
          {/*
            Lo que falta, ARRIBA del todo y antes de pulsar. Publicar es irreversible: enterarse de
            que faltaba algo despues de intentarlo, con una frase que no dice cual, es la peor
            forma de descubrirlo.
          */}
          {faltaParaPublicar.length > 0 ? (
            <div className="rounded-lg border border-warn bg-warn-soft px-4 py-3">
              <p className="text-sm font-medium text-warn">Falta esto para poder publicar</p>
              <ul className="mt-1.5 space-y-1">
                {faltaParaPublicar.map((linea) => (
                  <li key={linea} className="text-sm text-ink-700">
                    {linea}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/*
            Lo que el tipo pide y no esta. Se distingue del bloque de arriba a proposito: aquello
            IMPIDE publicar, esto no. Pintarlos iguales ensenaria que a veces el aviso ambar deja
            seguir y a veces no, que es la forma mas rapida de que se dejen de leer los dos.
          */}
          {loQuePideElTipo.length > 0 ? (
            <div className="rounded-lg border border-line-strong bg-paper px-4 py-3">
              <p className="text-sm font-medium text-ink-900">
                Se puede publicar, pero {activity ? `una "${activity.activityType.name}"` : 'este tipo'} normalmente
                lleva mas
              </p>
              <ul className="mt-1.5 space-y-1">
                {loQuePideElTipo.map((linea) => (
                  <li key={linea} className="text-sm text-ink-500">
                    {linea}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-500">
                Si publicas asi, queda registrado en la auditoria que se hizo a sabiendas.
              </p>
            </div>
          ) : null}

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

      <Drawer
        open={borrarOpen}
        onOpenChange={setBorrarOpen}
        title="Eliminar esta formacion"
        description="Deja de aparecer en el catalogo. Lo que ya curso alguien no se borra."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setBorrarOpen(false)}>
              Cancelar
            </Button>
            {/* Se repite el objeto en el boton: "Si" a secas sobre algo destructivo no dice que se borra. */}
            <Button variant="danger" onClick={() => void eliminarFormacion()} loading={busy}>
              Eliminar formacion
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-ink-700">
            Se va a eliminar <span className="font-medium text-ink-900">{activity.name}</span>.
          </p>
          <ul className="space-y-1 text-sm text-ink-500">
            <li>Desaparece del catalogo y no se le puede exigir a nadie mas.</li>
            <li>El historico de quien la curso se conserva: la evidencia no se borra.</li>
            <li>Si tiene convocatorias, el sistema no la deja: primero se cancelan.</li>
          </ul>
        </div>
      </Drawer>
    </div>
  );
}

/**
 * LA PORTADA de la formacion (Decision #88).
 *
 * Debajo hay SIEMPRE una portada generada a partir del id, asi que esto no es un campo
 * obligatorio ni un hueco que rellenar: es una mejora. Por eso no lleva asterisco, se puede
 * quitar, y el texto dice que sin foto tambien se ve bien —si no, alguien subiria una foto
 * borrosa de WhatsApp solo por quitarse el aviso de encima, y eso se ve peor que la generada—.
 *
 * Se guarda AL INSTANTE y no espera al boton de guardar de la ficha: una foto no es evidencia y
 * no forma parte del borrador de la version (por eso vive en la actividad).
 */
function PortadaFormacion({
  activityId,
  seed,
  coverKey,
  colorHex,
  onChange,
}: {
  activityId: string;
  seed: string;
  coverKey: string | null;
  colorHex: string | null;
  onChange: (coverKey: string | null) => void;
}) {
  const { showToast } = useToast();
  const [subiendo, setSubiendo] = useState(false);
  const input = useRef<HTMLInputElement | null>(null);

  const guardar = async (clave: string | null) => {
    setSubiendo(true);
    try {
      await updateActivity(activityId, { coverKey: clave });
      onChange(clave);
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo guardar la portada', description: motivoDelError(error) });
    } finally {
      setSubiendo(false);
    }
  };

  return (
    <div className="group relative w-40 shrink-0">
      <ActivityCover seed={seed} colorHex={colorHex} coverKey={coverKey} variant="tile" className="w-full" />
      <div className="absolute inset-0 flex items-center justify-center gap-1.5 rounded-lg bg-black/55 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        <button
          type="button"
          disabled={subiendo}
          onClick={() => input.current?.click()}
          className="focus-ring rounded-md bg-white/95 px-2.5 py-1.5 text-xs font-medium text-ink-900 disabled:opacity-60"
        >
          {subiendo ? 'Subiendo...' : coverKey ? 'Cambiar' : 'Subir foto'}
        </button>
        {coverKey ? (
          <button
            type="button"
            disabled={subiendo}
            onClick={() => void guardar(null)}
            className="focus-ring rounded-md bg-white/20 px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-60"
          >
            Quitar
          </button>
        ) : null}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (!file) return;
          setSubiendo(true);
          try {
            const subido = await uploadMedia(file, 'cover');
            await guardar(subido.storageKey);
          } catch (error) {
            showToast({ kind: 'danger', title: 'No se pudo subir la imagen', description: motivoDelError(error) });
            setSubiendo(false);
          }
        }}
      />
      <p className="mt-1.5 text-center text-[11px] leading-tight text-ink-300">
        {coverKey ? 'Portada propia' : 'Sin foto se ve la portada generada'}
      </p>
    </div>
  );
}
