'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Activity,
  ArrowLeft,
  CalendarRange,
  CalendarX2,
  CheckCircle2,
  ClipboardList,
  FileText,
  Layers,
  Link2,
  Pencil,
  Plus,
  RotateCcw,
  Rows3,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Unlink,
} from 'lucide-react';
import { ApiError, motivoDelError } from '@/lib/api';
import {
  activatePlan,
  addPlanItem,
  adjustProjected,
  approvePlan,
  cancelOffering,
  closePlan,
  deletePlan,
  getPlan,
  listOfferings,
  listPlans,
  removePlanItem,
  reopenPlan,
  updatePlan,
  updatePlanItem,
  type OfferingListItem,
  type PlanDetail,
  type PlanItemRow,
  type PlanItemStatus,
  type PlanMetrics,
  type PlanStatus,
} from '@/lib/delivery-api';
import { readTypeConfig, type ActivityTypeConfig } from '@/lib/activity-type';
import type { Modality } from '@/lib/catalog-api';
import { formatDate, monthName, MONTHS } from '@/lib/format';
import { NewOfferingDrawer } from '@/components/modules/delivery/new-offering-drawer';
import { useCan } from '@/components/providers/session-provider';
import { Button } from '@/components/ui/button';
import { cn } from '@/components/ui/cn';
import { Drawer } from '@/components/ui/drawer';
import { EmptyState } from '@/components/ui/empty-state';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Combo } from '@/components/ui/combo';
import { StatusPill, type StatusPillKind } from '@/components/ui/status-pill';
import { Table, TBody, Td, Th, THead, Tr } from '@/components/ui/table';
import { getEjecucionDelPlan, type FilaPlan } from '@/lib/reports-api';
import { MedicionDelPlan } from '@/components/modules/admin/medicion-del-plan';
import { Modal } from '@/components/ui/modal';
import { Analitica } from '@/components/modules/admin/analitica';
import { BarraEjecucion } from '@/components/modules/admin/barra-ejecucion';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';

/**
 * EL PLAN DEL ANO, visto como se piensa.
 *
 * Antes esto era una tabla plana de renglones y un desplegable de cien convocatorias para agregar
 * uno. Dos cosas fallaban, y las dos las dijo el cliente:
 *
 *  1. **Obligaba a salir del plan para todo.** La convocatoria tenia que existir ANTES, asi que
 *     planear el ano eran cuatro pantallas por linea: crear la actividad, publicarla, ir a
 *     Convocatorias, crear la jornada y volver aqui a buscarla.
 *  2. **La tabla plana no se parece a un plan.** Una reinduccion con tres jornadas —Bogota,
 *     Medellin, Barranquilla— salian como tres filas casi identicas, sin que se viera que son la
 *     misma capacitacion.
 *
 * Ahora hay TRES VISTAS del mismo plan, y cada una contesta una pregunta distinta:
 *  - **Por capacitacion**: que se va a dictar este ano y con cuantas jornadas cada cosa.
 *  - **Cronograma**: que toca en marzo. Es el Excel de doce columnas que ya tienen, pero vivo:
 *    cada jornada se arrastra de mes y eso queda como REPROGRAMADA.
 *  - **Por sistema de gestion**: lo que pide el auditor —el plan SST, el PESV y el BASC son vistas
 *    del mismo plan—.
 *
 * Lo que NO cambia es el modelo: el plan REFERENCIA convocatorias, no se apropia de la actividad
 * (regla de oro 3), y sus metricas se calculan solo sobre lo nacido del plan (regla de oro 2).
 */

const PLAN_STATUS: Record<PlanStatus, { kind: StatusPillKind; label: string }> = {
  DRAFT: { kind: 'neutral', label: 'BORRADOR' },
  APPROVED: { kind: 'info', label: 'APROBADO' },
  ACTIVE: { kind: 'ok', label: 'EN EJECUCION' },
  CLOSED: { kind: 'neutral', label: 'CERRADO' },
};

/** El estado de una convocatoria, con las mismas palabras que en su propia pantalla. */
const OFFERING_BADGE: Record<string, { label: string; tone: 'ok' | 'warn' | 'danger' | 'info' | 'neutral' }> = {
  DRAFT: { label: 'BORRADOR', tone: 'neutral' },
  PUBLISHED: { label: 'PUBLICADA', tone: 'info' },
  IN_PROGRESS: { label: 'EN CURSO', tone: 'warn' },
  COMPLETED: { label: 'CERRADA', tone: 'ok' },
  CANCELLED: { label: 'CANCELADA', tone: 'danger' },
};

const ITEM_STATUS: Record<PlanItemStatus, { kind: StatusPillKind; label: string }> = {
  PLANNED: { kind: 'neutral', label: 'PROGRAMADA' },
  EXECUTED: { kind: 'ok', label: 'EJECUTADA' },
  RESCHEDULED: { kind: 'warn', label: 'REPROGRAMADA' },
  CANCELLED: { kind: 'danger', label: 'CANCELADA' },
};

/**
 * Se llama POR PROCESO y no "por sistema de gestion".
 *
 * El glosario y el formulario de la actividad ya dicen "Proceso" —SGI, SST, PESV, SARLAFT— y tener
 * dos nombres para lo mismo es justo lo que ese documento existe para evitar: quien lee "sistema de
 * gestion" en una pestana y "Proceso" en un campo, se pregunta si son cosas distintas.
 */
type PlanView = 'capacitacion' | 'mes' | 'proceso' | 'tabla' | 'ejecucion';

/** Una capacitacion del plan con todas sus jornadas. */
interface ActivityGroup {
  activityId: string;
  activityName: string;
  processName: string;
  versionId: string;
  versionNumber: number;
  /** Lo que decide que campos pide otra jornada de esta misma capacitacion. */
  typeConfig: ActivityTypeConfig;
  modality: Modality;
  items: PlanItemRow[];
  projected: number;
  trained: number;
  executed: number;
}

/**
 * Agrupa los renglones por CAPACITACION, conservando el orden de mes dentro de cada una.
 *
 * Los proyectados se suman del valor CONGELADO cuando existe: es el que sostiene el indicador de
 * cobertura, y el vivo de la convocatoria puede haberse movido despues (regla de oro 5).
 */
function groupByActivity(items: PlanItemRow[]): ActivityGroup[] {
  const groups = new Map<string, ActivityGroup>();
  for (const item of items) {
    const activity = item.offering.activityVersion.activity;
    const existing = groups.get(activity.id);
    const projected = item.projectedSnapshot ?? item.offering.projectedCount ?? 0;
    if (existing) {
      existing.items.push(item);
      existing.projected += projected;
      existing.trained += item.facts?.trained ?? 0;
      if (item.status === 'EXECUTED') existing.executed += 1;
    } else {
      groups.set(activity.id, {
        activityId: activity.id,
        activityName: activity.name,
        processName: activity.process.name,
        versionId: item.offering.activityVersion.id,
        versionNumber: item.offering.activityVersion.versionNumber,
        typeConfig: readTypeConfig(activity.activityType.config),
        modality: activity.modality,
        items: [item],
        projected,
        trained: item.facts?.trained ?? 0,
        executed: item.status === 'EXECUTED' ? 1 : 0,
      });
    }
  }
  for (const group of groups.values()) {
    group.items.sort((a, b) => a.plannedMonth - b.plannedMonth);
  }
  return [...groups.values()].sort((a, b) => a.activityName.localeCompare(b.activityName, 'es'));
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint: string }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium uppercase tracking-[0.04em] text-ink-500">{label}</p>
      <p className="mt-1 font-display text-[28px] font-bold tabular-nums text-ink-900">{value}</p>
      <p className="mt-1 text-xs text-ink-500">{hint}</p>
    </div>
  );
}

export default function PlanDetallePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const { showToast } = useToast();
  /**
   * El ciclo de vida del plan NO es gestion: aprobar congela los proyectados y crea obligaciones
   * para toda la empresa, asi que exige `plans:approve`, que el Analista no tiene. Sin esto la
   * pantalla le ofrecia "Aprobar plan" y el servidor le contestaba 403 al pulsarlo.
   */
  const can = useCan();
  const canApprove = can('plans:approve');

  const [plan, setPlan] = useState<PlanDetail | null>(null);
  /** Cabecera y borrado: dos cajones porque son dos decisiones de distinto peso. */
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ year: '', name: '', objective: '', goalPct: '', scope: '', justification: '' });
  /** La ficha del plan —objetivo, alcance y meta— se lee cuando hace falta, no todos los dias. */
  const [fichaAbierta, setFichaAbierta] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteReason, setDeleteReason] = useState('');
  /** Reabrir el ano cerrado. Pide motivo siempre: el auditor va a preguntar por que se movio. */
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [offerings, setOfferings] = useState<OfferingListItem[]>([]);
  /** Lo que se escribe para BUSCAR una convocatoria: la lista no cabe en un desplegable. */
  const [offeringQuery, setOfferingQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<PlanView>('capacitacion');

  /** Cajon de crear la jornada desde el plan. `locked` = "otra jornada de esta misma". */
  const [newOpen, setNewOpen] = useState(false);
  const [locked, setLocked] = useState<{
    id: string;
    label: string;
    config: ActivityTypeConfig;
    modality: Modality;
  } | null>(null);
  const [defaultMonth, setDefaultMonth] = useState<number | undefined>(undefined);

  /**
   * FILTROS. Con 52 capacitaciones en un plan, una lista sin filtro no es una lista: es un muro.
   * Se filtra sobre lo ya cargado —el plan entero viene en una peticion— asi que responden al
   * instante y no hacen ir y volver al servidor por cada tecla.
   */
  const [fProcess, setFProcess] = useState('');
  const [fMonth, setFMonth] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [q, setQ] = useState('');

  /** Ajuste de proyectados: se abre desde la celda del renglon (Decision #56). */
  const [adjust, setAdjust] = useState<PlanItemRow | null>(null);
  const [adjustForm, setAdjustForm] = useState({ count: '', reason: '' });
  /** Cancelar la jornada: es un hecho del mundo, y por eso pide motivo. */
  const [cancelItem, setCancelItem] = useState<PlanItemRow | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  /** Camino secundario: enganchar una convocatoria que YA existe. */
  const [attachOpen, setAttachOpen] = useState(false);
  const [attachForm, setAttachForm] = useState({
    offeringId: '',
    plannedMonth: String(new Date().getMonth() + 1),
    justification: '',
  });

  const load = useCallback(async () => {
    try {
      setPlan(await getPlan(id));
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo cargar el plan', description: motivoDelError(error) });
    }
  }, [id, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Los anos que YA tienen plan. Hacen falta para que el selector de ano del cajon de editar no
   * ofrezca uno ocupado: hay un plan por ano (Decision #71) y elegirlo solo lleva a un rechazo.
   * Falla en silencio a proposito — si no se pudieron traer, se ofrecen todos y contesta el
   * servidor; un aviso de error aqui seria ruido en una pantalla que se abrio para otra cosa.
   */
  const [anosOcupados, setAnosOcupados] = useState<number[]>([]);
  useEffect(() => {
    void listPlans()
      .then((rows) => setAnosOcupados(rows.map((row) => row.year)))
      .catch(() => undefined);
  }, []);

  /**
   * Las convocatorias que se ofrecen para enganchar al plan: las que CASAN con lo que se busca,
   * pedidas al servidor. Sin busqueda se traen las primeras, que sirve para empezar; en cuanto se
   * escribe algo, la respuesta es exacta y ya no depende de que quepa en una pagina.
   */
  useEffect(() => {
    const termino = offeringQuery.trim();
    const timer = setTimeout(() => {
      void listOfferings({ pageSize: 100, ...(termino.length >= 2 ? { q: termino } : {}) })
        .then((result) => setOfferings(result.items))
        .catch(() => undefined);
    }, termino.length >= 2 ? 250 : 0);
    return () => clearTimeout(timer);
  }, [offeringQuery]);

  const processes = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of plan?.items ?? []) {
      const process = item.offering.activityVersion.activity.process;
      map.set(process.id, process.name);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  }, [plan]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (plan?.items ?? []).filter((item) => {
      const activity = item.offering.activityVersion.activity;
      if (fProcess && activity.process.id !== fProcess) return false;
      if (fMonth && item.plannedMonth !== Number(fMonth)) return false;
      if (fStatus && item.status !== fStatus) return false;
      if (term && !`${activity.name} ${item.offering.code}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [plan, fProcess, fMonth, fStatus, q]);

  const groups = useMemo(() => groupByActivity(filtered), [filtered]);
  const filtering = Boolean(fProcess || fMonth || fStatus || q.trim());

  /**
   * REPROGRAMAR arrastrando en el cronograma. Se pinta antes de que conteste el servidor —mover
   * una ficha y esperar tres decimas a que se mueva se siente roto— y si falla se recarga el plan,
   * que devuelve la verdad.
   */
  const reschedule = async (item: PlanItemRow, month: number) => {
    setPlan((previous) =>
      previous
        ? {
            ...previous,
            items: previous.items.map((row) => (row.id === item.id ? { ...row, plannedMonth: month } : row)),
          }
        : previous,
    );
    try {
      await updatePlanItem(item.id, { plannedMonth: month });
      await load();
      showToast({
        kind: 'success',
        title: `Movida a ${monthName(month)}`,
        description: 'Queda como REPROGRAMADA: el indicador distingue lo que se movio.',
      });
    } catch (error) {
      await load();
      showToast({
        kind: 'danger',
        title:
          error instanceof ApiError && error.code === 'PLAN_ITEM_EXECUTED'
            ? 'Esa jornada ya se ejecuto: no se reprograma'
            : 'No se pudo reprogramar',
      });
    }
  };

  const openCancel = (item: PlanItemRow) => {
    setCancelReason('');
    setCancelItem(item);
  };

  /**
   * CANCELAR LA JORNADA, no "quitar el renglon".
   *
   * Se cancela la CONVOCATORIA, que es donde vive el hecho: el servidor pone el renglon en
   * CANCELADA, retira las obligaciones que nacieron del plan y avisa a quien estaba citado. Si
   * se cancelara solo el renglon, la jornada seguiria publicada y la gente seguiria esperandola.
   */
  const doCancel = async () => {
    if (!cancelItem) return;
    setBusy(true);
    try {
      const result = await cancelOffering(cancelItem.offering.id, cancelReason.trim());
      setCancelItem(null);
      await load();
      showToast({
        kind: 'success',
        title: result.executed ? 'Jornada cancelada' : 'Solicitud enviada a aprobacion',
        description: result.executed
          ? 'El renglon queda CANCELADA, se retiran sus obligaciones y se avisa a los convocados.'
          : undefined,
      });
    } catch (error) {
      showToast({
        kind: 'danger',
        title: error instanceof ApiError && error.message ? error.message : 'No se pudo cancelar la jornada',
      });
    } finally {
      setBusy(false);
    }
  };

  const openAdjust = (item: PlanItemRow) => {
    setAdjustForm({ count: String(item.projectedSnapshot ?? item.offering.projectedCount ?? ''), reason: '' });
    setAdjust(item);
  };

  const saveAdjust = async () => {
    if (!adjust) return;
    setBusy(true);
    try {
      const result = await adjustProjected(adjust.offering.id, {
        projectedCount: Number(adjustForm.count),
        reason: adjustForm.reason.trim(),
      });
      await load();
      setAdjust(null);
      // La pantalla dice cual de las dos cosas paso: quien no puede publicar no ajusto nada
      // todavia, lo PROPUSO. Decir "ajustado" ahi seria mentirle.
      showToast(
        result.executed
          ? { kind: 'success', title: 'Proyectados ajustados', description: 'El motivo queda en la auditoria del renglon.' }
          : { kind: 'info', title: 'Enviado a aprobacion', description: 'El administrador decide; el numero no cambia hasta entonces.' },
      );
    } catch (error) {
      showToast({ kind: 'danger', title: error instanceof ApiError ? error.message : 'No se pudo ajustar' });
    } finally {
      setBusy(false);
    }
  };

  const attach = async () => {
    setBusy(true);
    try {
      setPlan(
        await addPlanItem(id, {
          offeringId: attachForm.offeringId,
          plannedMonth: Number(attachForm.plannedMonth),
          justification: needsReason ? attachForm.justification.trim() : undefined,
        }),
      );
      showToast({ kind: 'success', title: 'Renglon agregado' });
      setAttachOpen(false);
    } catch (error) {
      /*
        EL SERVIDOR YA ESCRIBIO LA FRASE, y no se tira (2026-09-04).

        Esto decia "No se pudo agregar el renglon" para todo lo que no fuera
        `OFFERING_ALREADY_IN_PLAN`. Con `ACTIVITY_NOT_PLANNABLE` —una induccion que alguien intenta
        meter al plan— el usuario se quedaba sin saber POR QUE, y el servidor manda un mensaje que
        lo dice exactamente. Descartarlo para poner uno generico es tirar la unica parte util de la
        respuesta.
      */
      const esConocido = error instanceof ApiError && error.code === 'OFFERING_ALREADY_IN_PLAN';
      // El `message` del servidor viaja como `title` (RFC 9457). Los que NO lo traen se quedan con
      // el nombre de la excepcion de Nest —"Conflict Exception"— y eso no se le ensena a nadie.
      const delServidor = error instanceof ApiError ? error.body.title : undefined;
      const util = delServidor && !delServidor.endsWith('Exception') ? delServidor : undefined;
      showToast({
        kind: 'danger',
        title: esConocido ? 'Esa convocatoria ya esta en un plan' : 'No se pudo agregar el renglon',
        description: esConocido ? undefined : util,
      });
    } finally {
      setBusy(false);
    }
  };

  const removeItem = async (itemId: string) => {
    setBusy(true);
    try {
      await removePlanItem(itemId);
      await load();
      showToast({ kind: 'success', title: 'Renglon quitado' });
    } catch (error) {
      showToast({
        kind: 'danger',
        title:
          error instanceof ApiError && error.code === 'PLAN_ITEM_HAS_ASSIGNMENTS'
            ? 'El renglon ya genero obligaciones: cancelalo en vez de borrarlo'
            : 'No se pudo quitar el renglon',
      });
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    setBusy(true);
    try {
      const result = await approvePlan(id);
      showToast({
        kind: 'success',
        title: 'Plan aprobado',
        description: `Se congelaron los proyectados y nacieron ${result.assignments} obligaciones del plan.`,
      });
      await load();
    } catch (error) {
      showToast({
        kind: 'danger',
        title:
          error instanceof ApiError && error.code === 'PLAN_OFFERINGS_NOT_PUBLISHED'
            ? 'Publica primero las convocatorias del plan'
            : error instanceof ApiError && error.code === 'PLAN_EMPTY'
              ? 'Un plan sin renglones no se aprueba'
              : 'No se pudo aprobar el plan',
      });
    } finally {
      setBusy(false);
    }
  };

  const openEdit = () => {
    if (!plan) return;
    setEditForm({
      year: String(plan.year),
      name: plan.name,
      objective: plan.objective ?? '',
      goalPct: plan.goalPct === null ? '' : String(plan.goalPct),
      scope: plan.scope ?? '',
      justification: '',
    });
    setEditOpen(true);
  };

  const saveHeader = async () => {
    if (!plan) return;
    setBusy(true);
    try {
      await updatePlan(id, {
        // El ano solo viaja en borrador: despues el servidor lo rechaza, y mandarlo seria
        // ofrecer en pantalla algo que no va a pasar.
        ...(plan.status === 'DRAFT' ? { year: Number(editForm.year) } : {}),
        name: editForm.name.trim(),
        objective: editForm.objective.trim() || null,
        goalPct: editForm.goalPct.trim() ? Number(editForm.goalPct) : null,
        scope: editForm.scope.trim() || null,
        ...(plan.status === 'DRAFT' ? {} : { justification: editForm.justification.trim() }),
      });
      showToast({ kind: 'success', title: 'Plan actualizado' });
      setEditOpen(false);
      await load();
    } catch (error) {
      showToast({
        kind: 'danger',
        title:
          error instanceof ApiError && error.code === 'DUPLICATE_PLAN'
            ? 'Ya existe un plan con ese nombre para el ano'
            : error instanceof ApiError && error.code === 'PLAN_YEAR_LOCKED'
              ? 'El ano de un plan aprobado no se cambia'
              : 'No se pudo actualizar el plan',
      });
    } finally {
      setBusy(false);
    }
  };

  /**
   * Borrar el plan. La pantalla NO decide si se puede —eso vive en el servidor— pero si tiene que
   * traducir su negativa: "ya hay gente que empezo" no es un error tecnico, es la razon por la que
   * ese plan ya es de otros.
   */
  const destroy = async () => {
    setBusy(true);
    try {
      const result = await deletePlan(id, deleteReason.trim() ? { justification: deleteReason.trim() } : {});
      showToast({
        kind: 'success',
        title: 'Plan eliminado',
        description:
          result.revokedAssignments > 0
            ? `Se revocaron ${result.revokedAssignments} obligaciones que habian nacido de el.`
            : undefined,
      });
      router.push('/plan');
    } catch (error) {
      showToast({
        kind: 'danger',
        title: error instanceof ApiError && error.message ? error.message : 'No se pudo eliminar el plan',
      });
      setBusy(false);
    }
  };

  const changeStatus = async (next: 'ACTIVE' | 'CLOSED') => {
    setBusy(true);
    try {
      await (next === 'ACTIVE' ? activatePlan(id) : closePlan(id));
      showToast({ kind: 'success', title: next === 'ACTIVE' ? 'Plan en ejecucion' : 'Plan cerrado' });
      await load();
    } catch (error) {
      showToast({ kind: 'danger', title: 'No se pudo cambiar el estado', description: motivoDelError(error) });
    } finally {
      setBusy(false);
    }
  };

  const doReopen = async () => {
    setBusy(true);
    try {
      await reopenPlan(id, reopenReason.trim());
      showToast({ kind: 'success', title: 'Plan reabierto', description: 'Vuelve a admitir renglones. Queda en la auditoria.' });
      setReopenOpen(false);
      await load();
    } catch (error) {
      showToast({
        kind: 'danger',
        title: error instanceof ApiError && error.message ? error.message : 'No se pudo reabrir el plan',
      });
    } finally {
      setBusy(false);
    }
  };

  if (!plan) return <Skeleton className="h-96 w-full" />;

  /**
   * Solo el BORRADOR se compone. Un plan aprobado NO se edita (Decision #40): sus renglones ya
   * obligan a personas reales, y agregarle cosas en silencio reescribiria el programa contra el
   * que se mide el cumplimiento.
   */
  /**
   * Las convocatorias que se pueden enganchar: ni canceladas, ni de tipos que no cuentan para
   * el plan (Decision #78). Se calcula aparte para que el vacio pueda EXPLICARSE.
   */
  const elegibles = offerings.filter(
    (offering) =>
      offering.status !== 'CANCELLED' &&
      readTypeConfig(offering.activityVersion.activity.activityType.config).participatesInPlan,
  );

  const isDraft = plan.status === 'DRAFT';
  /**
   * Los anos que se pueden elegir en el cajon de editar: dos atras y uno adelante, sin los que ya
   * tienen plan — pero SIEMPRE con el suyo, porque "dejarlo como esta" tiene que ser una opcion.
   */
  const enCurso = new Date().getFullYear();
  const anosElegibles = [...new Set([plan.year, ...[enCurso - 2, enCurso - 1, enCurso, enCurso + 1]])]
    .filter((year) => year === plan.year || !anosOcupados.includes(year))
    .sort((a, b) => a - b);
  /**
   * AGREGAR y BORRAR dejaron de ser la misma pregunta (Decision #55).
   *
   * Borrar un renglon sigue siendo cosa del borrador: cuando el plan ya obliga a gente, quitarlo
   * reescribiria el pasado —lo que se hace entonces es CANCELAR, que deja rastro—. Agregar no
   * reescribe nada, y prohibirlo no evitaba el cambio: lo sacaba del sistema. Si el plan esta
   * vivo, se agrega con motivo; si esta cerrado, ya no se toca.
   */
  const canAdd = plan.status !== 'CLOSED';
  const needsReason = canAdd && !isDraft;
  const metrics = plan.metrics;

  /**
   * Abre el cajon. Con `group`, la capacitacion viene fija —es "otra jornada de esta misma"— y el
   * mes arranca en el de la ultima jornada, que es de donde se sigue contando.
   */
  const openNew = (group?: ActivityGroup) => {
    // El tipo y la modalidad viajan con la version: son lo que decide que campos pide la
    // jornada nueva, y buscarlos en un listado recortado a 100 actividades fallaba en silencio.
    setLocked(
      group
        ? {
            id: group.versionId,
            label: `${group.activityName} (v${group.versionNumber})`,
            config: group.typeConfig,
            modality: group.modality,
          }
        : null,
    );
    setDefaultMonth(group ? group.items.at(-1)?.plannedMonth : undefined);
    setNewOpen(true);
  };

  return (
    <div>
      <Link href="/plan" className="focus-ring mb-4 inline-flex items-center gap-1.5 text-sm text-ink-500 hover:text-ink-900">
        <ArrowLeft size={15} />
        Planes
      </Link>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-[28px] font-semibold text-ink-900">{plan.name}</h1>
            <StatusPill kind={PLAN_STATUS[plan.status].kind} label={PLAN_STATUS[plan.status].label} />
          </div>
          <p className="mt-1 text-sm text-ink-500">
            Ano {plan.year}
            {plan.approvedAt ? ` · aprobado el ${formatDate(plan.approvedAt)}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canAdd ? (
            <>
              {/*
                CREAR LA CAPACITACION SIN SALIRSE DEL PLAN. No se puede resolver en un cajon: una
                capacitacion nueva hay que ARMARLA —contenido, evaluacion— y publicarla antes de
                poder convocarla. Lo que si se puede es que el plan te lleve y te traiga de vuelta:
                se va con `volverA` y la ficha de la actividad ofrece el regreso.

                Y va con el TIPO puesto. Quien pulsa esto desde el plan esta creando una
                capacitacion DEL PLAN; dejar el desplegable en blanco hacia que se creara con otro
                tipo y despues no contara para nada del plan, sin que ninguna pantalla lo dijera.
              */}
              <Button
                variant="outline"
                onClick={() =>
                  router.push(`/contenido-formativo?nueva=1&tipo=PLAN&volverA=${encodeURIComponent(`/plan/${id}`)}`)
                }
              >
                <Sparkles size={16} />
                Crear capacitacion
              </Button>
              <Button variant="outline" onClick={() => setAttachOpen(true)}>
                <Link2 size={16} />
                Agregar convocatoria existente
              </Button>
              <Button variant="outline" onClick={() => openNew()}>
                <Plus size={16} />
                Agregar convocatoria nueva
              </Button>
            </>
          ) : null}
          {/*
            APROBAR es del borrador y solo del borrador. Al abrir "agregar" a los planes vivos
            (Decision #55) este boton se colo con ellos y aparecia sobre un plan YA APROBADO, que
            es ofrecer algo que el servidor rechaza.
          */}
          {isDraft && canApprove ? (
            <Button onClick={approve} loading={busy}>
              <CheckCircle2 size={16} />
              Aprobar plan
            </Button>
          ) : null}
          {plan.status === 'APPROVED' && canApprove ? (
            <Button onClick={() => changeStatus('ACTIVE')} loading={busy}>
              Marcar en ejecucion
            </Button>
          ) : null}
          {plan.status === 'ACTIVE' && canApprove ? (
            <Button variant="ghost" onClick={() => changeStatus('CLOSED')} loading={busy}>
              Cerrar el ano
            </Button>
          ) : null}
          {/*
            REABRIR. Cerrar es lo que convierte al plan en la evidencia del ano, asi que durante
            meses esto no existia. Con un plan por ano (Decision #71) esa regla paso a ser una
            trampa: un plan cerrado por error se queda con el ano y ya no se puede planear nada.
            La salida no es saltarse la regla, es que la operacion EXISTA y deje rastro.
          */}
          {plan.status === 'CLOSED' && canApprove ? (
            <Button
              variant="outline"
              onClick={() => {
                setReopenReason('');
                setReopenOpen(true);
              }}
            >
              <RotateCcw size={16} />
              Reabrir el ano
            </Button>
          ) : null}
          {/*
            CORREGIR Y BORRAR. Editar sigue siendo de los planes vivos: el cerrado es lo que se le
            ensena al auditor. BORRAR si se ofrece tambien cerrado, porque un plan que se cerro sin
            haber obligado a nadie no es evidencia de nada —es un ensayo— y desde que hay uno por
            ano dejarlo puesto bloquea el ano entero. Quien no pueda lo sabra por el mensaje del
            servidor, que dice el motivo real ("ya obligo a gente: reabrelo").
          */}
          {plan.status !== 'CLOSED' ? (
            <Button variant="ghost" onClick={openEdit}>
              <Pencil size={16} />
              Editar
            </Button>
          ) : null}
          {canApprove ? (
            <Button
              variant="ghost"
              className="text-danger"
              onClick={() => {
                setDeleteReason('');
                setDeleteOpen(true);
              }}
            >
              <Trash2 size={16} />
              Eliminar
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/*
          La META se lee AL LADO del cumplimiento, no en otra pantalla. Un "62%" solo deja al
          lector sin saber si eso esta bien, que es justo lo que el auditor viene a preguntar.
        */}
        <Stat
          label="Cumplimiento del programa"
          value={`${metrics.compliancePct}%`}
          hint={
            // La frase de siempre —"N ejecutadas de M programadas"— NO se toca: es la que da
            // sentido al numero y la que comprueba el e2e. La meta se ANADE detras, no sustituye.
            /*
              NO SE DICE "FALTAN N PUNTOS".

              En este producto los PUNTOS son otra cosa —los que gana el aprendiz al completar
              formaciones— y la misma palabra con dos significados en la misma pantalla se lee
              siempre por el lado equivocado. La meta sola basta: la resta la hace el ojo.
            */
            `${metrics.executed} ejecutadas de ${metrics.programmed} programadas` +
            (plan.goalPct === null
              ? ' · sin meta definida'
              : metrics.compliancePct >= plan.goalPct
                ? ` · meta del ${plan.goalPct}% cumplida`
                : ` · meta del ${plan.goalPct}%`)
          }
        />
        <Stat label="Cobertura" value={`${metrics.coveragePct}%`} hint={`${metrics.trained} capacitados de ${metrics.projected} proyectados`} />
        <Stat label="Obligaciones del plan" value={metrics.assigned} hint="Solo las nacidas de este plan" />
        <Stat label="Inscritos" value={metrics.enrolled} hint="Obligaciones que llegaron a inscripcion" />
      </div>

      {/*
        EL OBJETIVO Y EL ALCANCE, DETRAS DE UN BOTON (Decision #131).

        Ocupaban una tarjeta fija en una pantalla que se abre todos los dias para mirar como va el
        plan — y son un texto que se escribe una vez al ano y se lee una vez al trimestre, casi
        siempre para una auditoria. Empujaban hacia abajo lo que si se consulta a diario.

        Se abre en VENTANA CENTRADA y no en el cajon lateral: el cajon es para editar, y aqui no hay
        nada que rellenar. Ademas el alcance no se veia en ninguna parte aunque se pudiera escribir:
        estaba guardado y nunca se ensenaba.
      */}
      {plan.objective || plan.scope || plan.goalPct !== null ? (
        <button
          type="button"
          onClick={() => setFichaAbierta(true)}
          className="focus-ring mb-6 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-sm text-ink-700 transition-colors duration-150 hover:border-line-strong hover:text-ink-900"
        >
          <FileText size={15} strokeWidth={1.75} aria-hidden="true" />
          Objetivo, alcance y meta
        </button>
      ) : null}

      <Modal
        open={fichaAbierta}
        onOpenChange={setFichaAbierta}
        title={`Plan ${plan.year}`}
        description="Lo que la empresa se comprometio a hacer este ano"
        actions={
          /*
            EDITAR VA ARRIBA, JUNTO A CERRAR, y no en un pie.

            Un pie entero para un solo boton gasta una franja de ventana en algo que no cierra
            ninguna tarea: aqui no se esta rellenando nada, se esta leyendo. Arriba es ademas donde
            ya esta la otra accion sobre la ventana misma.

            En reposo es solo el lapiz; al pasar por encima se despliega la palabra hacia el lado.
            La rejilla de una columna que pasa de 0fr a 1fr anima el ANCHO sin saltos, que es lo que
            no se consigue con `width: auto`.

            Y no duplica el formulario: abre el MISMO editor de cabecera. Dos formularios sobre los
            mismos datos siempre acaban divergiendo, y nadie se entera hasta que alguien guarda
            desde el equivocado.
          */
          <button
            type="button"
            onClick={() => {
              setFichaAbierta(false);
              openEdit();
            }}
            aria-label="Editar el plan"
            className="focus-ring group/ed flex shrink-0 items-center gap-1 rounded-md p-1.5 text-ink-500 transition-colors duration-150 hover:bg-surface hover:text-ink-900"
          >
            <Pencil className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
            <span className="grid grid-cols-[0fr] overflow-hidden transition-[grid-template-columns] duration-200 ease-pulse group-hover/ed:grid-cols-[1fr] group-focus-visible/ed:grid-cols-[1fr]">
              <span className="min-w-0 overflow-hidden whitespace-nowrap pr-0.5 text-sm">Editar</span>
            </span>
          </button>
        }
      >
        <dl className="space-y-5">
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">Meta de cumplimiento</dt>
            <dd className="mt-1 text-sm text-ink-700">
              {plan.goalPct === null ? (
                <span className="italic text-ink-500">Sin meta acordada todavia.</span>
              ) : (
                <>
                  <span className="font-display text-lg font-bold tabular-nums text-ink-900">{plan.goalPct}%</span>
                  {' '}de las jornadas programadas, ejecutadas.
                </>
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">Objetivo</dt>
            <dd className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink-700">
              {plan.objective ?? <span className="italic text-ink-500">Sin objetivo escrito.</span>}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">Alcance</dt>
            <dd className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink-700">
              {plan.scope ?? <span className="italic text-ink-500">Sin alcance escrito.</span>}
            </dd>
          </div>
        </dl>
      </Modal>

      {/* Tres vistas del MISMO plan: no son tres pantallas, es una pregunta distinta cada vez. */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex h-11 items-center gap-1 rounded-full bg-paper p-1">
          <ViewTab active={view} id="capacitacion" onSelect={setView} icon={Layers} label="Por capacitacion" />
          <ViewTab active={view} id="mes" onSelect={setView} icon={CalendarRange} label="Cronograma" />
          <ViewTab active={view} id="proceso" onSelect={setView} icon={ShieldCheck} label="Por proceso" />
          <ViewTab active={view} id="tabla" onSelect={setView} icon={Rows3} label="Tabla" />
          {/*
            COMO VA, y no como se planeo (Decision #122). Las otras cuatro vistas responden "¿que
            hay en el plan?"; esta responde "¿se esta cumpliendo?", que es la pregunta que hace el
            auditor y la unica que no se podia contestar sin abrir el indicador a mano.
          */}
          <ViewTab active={view} id="ejecucion" onSelect={setView} icon={Activity} label="Como va" />
        </div>
        <span className="text-sm text-ink-500">
          {groups.length} {groups.length === 1 ? 'capacitacion' : 'capacitaciones'} · {filtered.length}{' '}
          {filtered.length === 1 ? 'jornada' : 'jornadas'}
          {filtering ? ` de ${plan.items.length}` : ''}
        </span>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-300" />
          <Input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Buscar capacitacion o numero"
            className="w-[260px] pl-9"
            aria-label="Buscar en el plan"
          />
        </div>
        <Select value={fProcess} onChange={(event) => setFProcess(event.target.value)} aria-label="Filtrar por proceso" className="w-[210px]">
          <option value="">Todos los procesos</option>
          {processes.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </Select>
        <Select value={fMonth} onChange={(event) => setFMonth(event.target.value)} aria-label="Filtrar por mes" className="w-[150px]">
          <option value="">Todo el ano</option>
          {MONTHS.map((month, index) => (
            <option key={month} value={index + 1}>
              {month}
            </option>
          ))}
        </Select>
        <Select value={fStatus} onChange={(event) => setFStatus(event.target.value)} aria-label="Filtrar por estado" className="w-[170px]">
          <option value="">Todos los estados</option>
          {Object.entries(ITEM_STATUS).map(([value, meta]) => (
            <option key={value} value={value}>
              {meta.label}
            </option>
          ))}
        </Select>
        {filtering ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setQ('');
              setFProcess('');
              setFMonth('');
              setFStatus('');
            }}
          >
            Quitar filtros
          </Button>
        ) : null}
      </div>

      {plan.items.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={ClipboardList}
            title="El plan todavia no tiene nada"
            description="Agrega la primera capacitacion del ano. Puedes crear la jornada aqui mismo, sin salir del plan."
            action={
              canAdd ? (
                <div className="flex flex-wrap justify-center gap-2">
                  <Button onClick={() => openNew()}>
                    <Plus size={16} />
                    Agregar convocatoria nueva
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() =>
                      router.push(`/contenido-formativo?nueva=1&tipo=PLAN&volverA=${encodeURIComponent(`/plan/${id}`)}`)
                    }
                  >
                    <Sparkles size={16} />
                    Crear capacitacion
                  </Button>
                </div>
              ) : undefined
            }
          />
        </div>
      ) : view === 'capacitacion' ? (
        <div className="space-y-3">
          {groups.map((group) => (
            <ActivityCard
              key={group.activityId}
              group={group}
              canRemove={isDraft}
              canAdd={canAdd}
              busy={busy}
              onRemove={removeItem}
              onCancel={openCancel}
              onAddSession={() => openNew(group)}
              onAdjust={openAdjust}
            />
          ))}
        </div>
      ) : view === 'mes' ? (
        <MonthGrid groups={groups} canReschedule={plan.status !== 'CLOSED'} onReschedule={reschedule} />
      ) : view === 'tabla' ? (
        <FlatTable items={filtered} canRemove={isDraft} busy={busy} onRemove={removeItem} onCancel={openCancel} onAdjust={openAdjust} />
      ) : view === 'ejecucion' ? (
        <EjecucionDelPlan planId={params.id} metrics={metrics} goalPct={plan.goalPct} />
      ) : (
        <ProcessTable plan={plan} />
      )}

      {/* Camino principal: la jornada se crea AQUI y entra al plan de una. */}
      <NewOfferingDrawer
        open={newOpen}
        onOpenChange={setNewOpen}
        lockedVersion={locked}
        askPlanMonth
        defaultMonth={defaultMonth}
        askJustification={needsReason}
        onCreated={async (offering, plannedMonth, justification) => {
          await addPlanItem(id, {
            offeringId: offering.id,
            plannedMonth: plannedMonth ?? new Date().getMonth() + 1,
            justification,
          });
          await load();
          showToast({
            kind: 'success',
            title: 'Agregada al plan',
            description: needsReason
              ? 'Publicala para que congele sus proyectados y empiece a obligar.'
              : 'Queda en borrador: publicala para congelar sus proyectados.',
          });
        }}
      />

      <Drawer
        open={cancelItem !== null}
        onOpenChange={(open) => !open && setCancelItem(null)}
        title="Cancelar la jornada"
        description={
          cancelItem
            ? `${cancelItem.offering.activityVersion.activity.name} · ${cancelItem.offering.code}`
            : undefined
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCancelItem(null)}>
              Volver
            </Button>
            <Button onClick={() => void doCancel()} loading={busy} disabled={cancelReason.trim().length < 10}>
              <CalendarX2 size={16} />
              Cancelar la jornada
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {/*
            QUE PASA, dicho antes de pulsar y en el orden en que le importa a alguien: primero
            las personas, despues los numeros. Cancelar tocaba tres cosas y no decia ninguna.
          */}
          <div className="rounded-lg border border-line bg-paper px-4 py-3 text-sm text-ink-700">
            <p className="font-medium text-ink-900">Al cancelar:</p>
            <ul className="mt-1.5 space-y-1">
              <li>
                Se avisa a <strong>{cancelItem?.facts?.enrolled ?? 0}</strong> personas que estaban citadas.
              </li>
              <li>
                Se retiran <strong>{cancelItem?.facts?.assigned ?? 0}</strong> obligaciones que nacieron de este
                renglon. Lo que alguien ya empezo no se toca: ese avance es suyo.
              </li>
              <li>El renglon queda CANCELADA y sale del cumplimiento, ni a favor ni en contra.</li>
            </ul>
          </div>
          <Field
            htmlFor="c-reason"
            label="Por que se cancela"
            required
            hint="Lo van a leer las personas citadas, y queda en la auditoria. Ejemplo: el instructor externo no confirmo."
          >
            <Textarea
              id="c-reason"
              rows={3}
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              placeholder="Minimo 10 caracteres"
            />
          </Field>
        </div>
      </Drawer>

      {/* Ajustar el denominador de la cobertura. Nunca en linea: exige motivo (regla de oro 3). */}
      <Drawer
        open={adjust !== null}
        onOpenChange={(open) => !open && setAdjust(null)}
        title="Ajustar proyectados"
        description={
          adjust
            ? `${adjust.offering.activityVersion.activity.name} · ${adjust.offering.code}`
            : undefined
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAdjust(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => void saveAdjust()}
              loading={busy}
              disabled={!adjustForm.count || adjustForm.reason.trim().length < 10}
            >
              Guardar ajuste
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="rounded-md bg-info-soft px-3 py-2 text-sm text-info">
            Los proyectados se congelan al publicar y son el denominador de la cobertura. Corregirlos a mano cambia el
            indicador, asi que el motivo es obligatorio y queda en la auditoria.
          </p>
          <Field htmlFor="pr-count" label="Proyectados" required>
            <Input
              id="pr-count"
              type="number"
              min={0}
              value={adjustForm.count}
              onChange={(event) => setAdjustForm({ ...adjustForm, count: event.target.value })}
            />
          </Field>
          <Field
            htmlFor="pr-reason"
            label="Motivo del ajuste"
            required
            hint="Ejemplo: ingresaron 7 conductores al area en marzo, despues de congelar."
          >
            <Textarea
              id="pr-reason"
              rows={3}
              value={adjustForm.reason}
              onChange={(event) => setAdjustForm({ ...adjustForm, reason: event.target.value })}
              placeholder="Minimo 10 caracteres"
            />
          </Field>
        </div>
      </Drawer>

      {/*
        ENGANCHAR UNA QUE YA EXISTE. Se planteo quitarlo —desde la Decision #75 una convocatoria
        de una capacitacion del plan entra sola— y se queda, porque hay un caso en que es la UNICA
        via: el plan ya APROBADO. Ahi nada entra solo (un renglon nuevo obliga a gente y exige
        motivo), asi que sin este boton una convocatoria ya creada no tendria forma de entrar.
        Tambien sirve para volver a enganchar un renglon que se quito por error.
      */}
      <Drawer
        open={attachOpen}
        onOpenChange={setAttachOpen}
        title="Agregar una convocatoria que ya existe"
        description="Solo la engancha al plan: no crea nada y no se apropia de la capacitacion."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAttachOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={attach}
              loading={busy}
              disabled={!attachForm.offeringId || (needsReason && attachForm.justification.trim().length < 10)}
            >
              Agregar
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {/*
            SE BUSCA, NO SE DESPLIEGA.

            El desplegable pedia las primeras 100 convocatorias y las pintaba todas. Con 253 en la
            base —un cliente llega ahi en dos anos— la que se acababa de publicar quedaba FUERA de
            la pagina y el plan no podia engancharla: el sintoma es "no aparece", y la causa
            estaba a dos capas. Ya paso una vez con el orden de las fechas (ver RUNBOOK); la
            diferencia es que ahora se pregunta al servidor en vez de traer un trozo y confiar.
          */}

          {/*
            SE ELIGE VIENDOLA, no de un desplegable.

            Una convocatoria no es "CONV-2026-000420": es esa formacion, de ese tipo, en ese
            estado y en esa fecha. Un `<select>` solo sabe ensenar lo primero y obliga a abrirlo
            para comparar dos. Y como la lista ademas viene FILTRADA, el desplegable mentia por
            omision: se buscaba algo, no aparecia, y no habia forma de saber si es que no existe
            o que no se ofrece — que es justo lo que se reporto como "la busqueda no funciona".
          */}
          <Field htmlFor="i-offering" label="Convocatoria" required>
            <Combo
              id="i-offering"
              placeholder="Elegir la convocatoria..."
              searchPlaceholder="Buscar por formacion o codigo..."
              // Se pregunta al SERVIDOR, no se filtra un trozo: con 253 convocatorias en la base
              // y un tope de 100, la recien publicada no estaria en la lista (ver RUNBOOK).
              onSearchChange={setOfferingQuery}
              searchHint="Se busca en todas las convocatorias, no solo en las que se ven."
              value={attachForm.offeringId}
              onChange={(offeringId) => setAttachForm({ ...attachForm, offeringId })}
              emptyLabel='No hay convocatorias que agregar'
              emptyHint="Solo aparecen las capacitaciones DEL PLAN: una induccion o una extraordinaria no puede mover sus indicadores."
              options={elegibles.map((offering) => ({
                id: offering.id,
                code: offering.code,
                label: offering.activityVersion.activity.name,
                chip: {
                  label: offering.activityVersion.activity.activityType.name,
                  colorHex: offering.activityVersion.activity.activityType.colorHex,
                },
                badge: OFFERING_BADGE[offering.status],
                meta: [
                  offering.scheduledDate ? formatDate(offering.scheduledDate) : 'Sin fecha (permanente)',
                  offering.regional?.name,
                  offering.activityVersion.activity.process.name,
                ]
                  .filter(Boolean)
                  .join(' · '),
              }))}
            />
          </Field>
          <Field htmlFor="i-month" label="Mes programado" required>
            <Select id="i-month" value={attachForm.plannedMonth} onChange={(event) => setAttachForm({ ...attachForm, plannedMonth: event.target.value })}>
              {MONTHS.map((month, index) => (
                <option key={month} value={index + 1}>
                  {month}
                </option>
              ))}
            </Select>
          </Field>

          {needsReason ? (
            <Field
              htmlFor="i-reason"
              label="Por que se agrega al plan aprobado"
              required
              hint="Queda en la auditoria junto al renglon. Ejemplo: se abrio la regional de Neiva en agosto."
            >
              <Textarea
                id="i-reason"
                rows={2}
                value={attachForm.justification}
                onChange={(event) => setAttachForm({ ...attachForm, justification: event.target.value })}
                placeholder="Minimo 10 caracteres"
              />
            </Field>
          ) : null}
        </div>
      </Drawer>

      <Drawer
        open={reopenOpen}
        onOpenChange={setReopenOpen}
        title={`Reabrir el plan de ${plan.year}`}
        description="Vuelve a EN EJECUCION y admite renglones otra vez. Sus obligaciones y sus indicadores no se tocan."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setReopenOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void doReopen()} loading={busy} disabled={reopenReason.trim().length < 10}>
              <RotateCcw size={16} />
              Reabrir el ano
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="rounded-md bg-info-soft px-3 py-2 text-sm text-info">
            Cerrar el ano es lo que convirtio este plan en la evidencia que se le ensena al auditor. Reabrirlo
            no borra nada, pero si queda registrado quien lo hizo, cuando y por que.
          </p>
          <Field
            htmlFor="r-reason"
            label="Por que se reabre"
            required
            hint="Ejemplo: se cerro por error antes de registrar las jornadas de diciembre."
          >
            <Textarea
              id="r-reason"
              rows={3}
              value={reopenReason}
              onChange={(event) => setReopenReason(event.target.value)}
              placeholder="Minimo 10 caracteres"
            />
          </Field>
        </div>
      </Drawer>

      {/*
        CORREGIR LA CABECERA. Nombre, objetivo, metas y alcance son texto: lo que obliga a la
        gente son los renglones. Por eso se pueden corregir con el plan aprobado, diciendo por
        que. El ANO no: ancla el vencimiento de cada renglon al ultimo dia de su mes, y moverlo
        despues de aprobar cambiaria la fecha limite de gente que ya tiene la obligacion encima.
      */}
      <Modal
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Editar el plan"
        description={
          plan.status === 'DRAFT'
            ? 'Esta en borrador: se puede cambiar todo, incluido el ano.'
            : 'El plan ya esta aprobado: se corrige la cabecera, con motivo. Sus renglones no se tocan aqui.'
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setEditOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={saveHeader}
              loading={busy}
              disabled={editForm.name.trim().length < 3 || (plan.status !== 'DRAFT' && editForm.justification.trim().length < 10)}
            >
              Guardar
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {plan.status === 'DRAFT' ? (
            /*
              EL ANO SE ELIGE, no se teclea: identifica al plan y solo hay un punado de valores
              posibles. Los anos que YA tienen plan no se ofrecen (hay uno por ano, Decision #71);
              el suyo si, porque dejarlo como esta tiene que ser una opcion.
            */
            <Field htmlFor="e-year" label="Ano" required hint="Ancla el vencimiento de cada renglon al ultimo dia de su mes.">
              <Select
                id="e-year"
                value={editForm.year}
                onChange={(event) => setEditForm({ ...editForm, year: event.target.value })}
              >
                {anosElegibles.map((year) => (
                  <option key={year} value={year}>
                    {year}
                    {year === new Date().getFullYear() ? ' (en curso)' : ''}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field htmlFor="e-name" label="Nombre" required>
            <Input
              id="e-name"
              value={editForm.name}
              onChange={(event) => setEditForm({ ...editForm, name: event.target.value })}
              maxLength={160}
            />
          </Field>
          <Field htmlFor="e-objective" label="Objetivo">
            <Textarea
              id="e-objective"
              rows={3}
              maxLength={4000}
              value={editForm.objective}
              onChange={(event) => setEditForm({ ...editForm, objective: event.target.value })}
            />
          </Field>
          {/*
            LA META ES UN NUMERO. Era texto libre y por eso el plan ensenaba "62% de cumplimiento"
            sin nada contra que compararlo: un indicador sin meta deja al lector sin saber si eso
            esta bien. Con ella, la pantalla puede decir "faltan 28 puntos" o "meta cumplida".
          */}
          <Field
            htmlFor="e-goal"
            label="Meta de cumplimiento (%)"
            hint="Cuanto del programa se compromete la empresa a ejecutar este ano. Lo habitual es 90."
          >
            <Input
              id="e-goal"
              type="number"
              min={1}
              max={100}
              value={editForm.goalPct}
              onChange={(event) => setEditForm({ ...editForm, goalPct: event.target.value })}
            />
          </Field>
          <Field htmlFor="e-scope" label="Alcance">
            <Textarea
              id="e-scope"
              rows={3}
              maxLength={4000}
              value={editForm.scope}
              onChange={(event) => setEditForm({ ...editForm, scope: event.target.value })}
            />
          </Field>
          {plan.status !== 'DRAFT' ? (
            <Field
              htmlFor="e-reason"
              label="Por que se corrige"
              required
              hint="Queda en la auditoria. El plan ya fue aprobado por alguien con lo que decia antes."
            >
              <Textarea
                id="e-reason"
                rows={2}
                value={editForm.justification}
                onChange={(event) => setEditForm({ ...editForm, justification: event.target.value })}
                placeholder="Minimo 10 caracteres"
              />
            </Field>
          ) : null}
        </div>
      </Modal>

      {/*
        BORRAR. La consecuencia se dice ANTES y en castellano, con la cifra: "se van a revocar 34
        obligaciones" es lo unico que permite decidir. Si el servidor se niega porque alguien ya
        empezo, su mensaje se muestra tal cual: explica de quien es ese avance.
      */}
      <Drawer
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Eliminar el plan"
        description="Desaparece el plan con todos sus renglones. Las capacitaciones y convocatorias que referencia NO se tocan."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={destroy}
              loading={busy}
              disabled={
                (plan.status === 'CLOSED' && metrics.assigned > 0) ||
                (plan.status !== 'DRAFT' && deleteReason.trim().length < 10)
              }
            >
              <Trash2 size={16} />
              Eliminar el plan
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {/*
            El plan CERRADO que ya obligo a gente no se borra, y se dice AQUI y no con un 409 al
            pulsar. Lo que si tiene es salida: reabrirlo, que deja rastro donde borrar no lo dejaria.
          */}
          {plan.status === 'CLOSED' && metrics.assigned > 0 ? (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
              Este plan esta CERRADO y creo <strong>{metrics.assigned} obligaciones</strong>: es la evidencia del ano y no
              se borra. Si hay que corregirlo, cierra esto y usa <strong>Reabrir el ano</strong>.
            </p>
          ) : metrics.assigned > 0 ? (
            <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">
              Este plan creo <strong>{metrics.assigned} obligaciones</strong>: al borrarlo se revocan y desaparecen de la
              bandeja de esas personas. Si alguna ya empezo su formacion, el plan no se puede borrar — ese avance es suyo.
            </p>
          ) : (
            <p className="text-sm text-ink-700">
              Todavia no obliga a nadie{plan.status === 'DRAFT' ? ': esta en borrador' : ''}. Se borra sin consecuencias
              para ninguna persona.
            </p>
          )}
          {plan.status !== 'DRAFT' ? (
            <Field
              htmlFor="d-reason"
              label="Por que se elimina"
              required
              hint="Queda en la auditoria: hubo gente a la que ya se le anuncio esta formacion."
            >
              <Textarea
                id="d-reason"
                rows={2}
                value={deleteReason}
                onChange={(event) => setDeleteReason(event.target.value)}
                placeholder="Minimo 10 caracteres"
              />
            </Field>
          ) : null}
        </div>
      </Drawer>
    </div>
  );
}

function ViewTab({
  id,
  active,
  onSelect,
  label,
  icon: Icon,
}: {
  id: PlanView;
  active: PlanView;
  onSelect: (id: PlanView) => void;
  label: string;
  icon: typeof Layers;
}) {
  const selected = active === id;
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      aria-pressed={selected}
      className={cn(
        'focus-ring flex h-9 items-center gap-2 rounded-full px-4 text-sm transition-all duration-150 ease-pulse',
        // Mismo criterio que en Seguimiento: la vista activa se pinta con el color de la empresa.
        // Blanco sobre gris claro no dice donde estas.
        selected ? 'font-medium text-white shadow-btn-flat' : 'text-ink-500 hover:bg-surface hover:text-ink-900',
      )}
      style={selected ? { backgroundColor: 'var(--brand-primary)' } : undefined}
    >
      <Icon size={15} strokeWidth={1.75} aria-hidden="true" />
      {label}
    </button>
  );
}

/**
 * UNA CAPACITACION DEL PLAN con sus jornadas dentro. Es la vista que faltaba: tres jornadas de la
 * misma reinduccion se leen como una cosa con tres fechas, y no como tres filas que se repiten.
 */
function ActivityCard({
  group,
  canRemove,
  canAdd,
  busy,
  onRemove,
  onCancel,
  onAddSession,
  onAdjust,
}: {
  group: ActivityGroup;
  /** Quitar el renglon: solo en borrador. Despues se CANCELA, que deja rastro. */
  canRemove: boolean;
  /** Agregar otra jornada: tambien con el plan vivo, con motivo (Decision #55). */
  canAdd: boolean;
  busy: boolean;
  onRemove: (itemId: string) => void;
  onCancel: (item: PlanItemRow) => void;
  onAddSession: () => void;
  onAdjust: (item: PlanItemRow) => void;
}) {
  const coverage = group.projected === 0 ? 0 : Math.round((group.trained / group.projected) * 100);

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line px-5 py-4">
        <div className="min-w-0">
          <h3 className="font-display text-base font-semibold text-ink-900">{group.activityName}</h3>
          <p className="mt-0.5 text-sm text-ink-500">
            {group.processName} · v{group.versionNumber} · {group.items.length}{' '}
            {group.items.length === 1 ? 'jornada' : 'jornadas'} · {group.projected} proyectados
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="font-display text-lg font-semibold tabular-nums text-ink-900">{coverage}%</p>
            <p className="text-xs text-ink-500">
              {group.trained} de {group.projected}
            </p>
          </div>
          <span className="h-1.5 w-24 overflow-hidden rounded-full bg-line">
            <span
              className="block h-full rounded-full transition-[width] duration-[320ms] ease-pulse"
              style={{ width: `${coverage}%`, backgroundColor: 'var(--brand-accent)' }}
            />
          </span>
        </div>
      </div>

      <Table>
        <THead>
          <Tr>
            <Th className="w-28">Mes</Th>
            <Th>Donde</Th>
            <Th>Convocatoria</Th>
            <Th className="text-right">Proyectados</Th>
            <Th className="text-right">Capacitados</Th>
            <Th>Estado</Th>
            {canRemove ? <Th className="w-20 text-right">Accion</Th> : null}
          </Tr>
        </THead>
        <TBody>
          {group.items.map((item) => (
            <Tr key={item.id}>
              <Td className="text-ink-700">{monthName(item.plannedMonth)}</Td>
              <Td>
                <div className="text-ink-900">{item.offering.regional?.name ?? 'Todas las regionales'}</div>
                {item.offering.scheduledDate ? (
                  <div className="text-xs text-ink-500">{formatDate(item.offering.scheduledDate)}</div>
                ) : null}
              </Td>
              <Td>
                <Link href={`/convocatorias/${item.offering.id}`} className="focus-ring font-mono text-xs text-ink-700 hover:underline">
                  {item.offering.code}
                </Link>
              </Td>
              <Td className="text-right tabular-nums text-ink-700">
                <ProjectedCell item={item} onAdjust={onAdjust} />
              </Td>
              <Td className="text-right tabular-nums text-ink-700">{item.facts?.trained ?? 0}</Td>
              <Td>
                <StatusPill kind={ITEM_STATUS[item.status].kind} label={ITEM_STATUS[item.status].label} />
              </Td>
              <Td className="text-right">
                <div className="flex items-center justify-end gap-1">
                  {/*
                    DOS ACCIONES, NO UNA. "Quitar del plan" es *esto no va en el plan* y solo cabe
                    mientras el plan es un borrador que no obliga a nadie. "Cancelar la jornada" es
                    *esto no se va a dictar*, que es un hecho del mundo: cancela la convocatoria,
                    avisa a los convocados y retira las obligaciones. Llamar "Quitar" a las dos era
                    lo que hacia imposible saber cual estabas usando.
                  */}
                  {canRemove ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemove(item.id)}
                      disabled={busy}
                      aria-label={`Quitar del plan la convocatoria ${item.offering.code}`}
                      title="Quitar del plan: saca este renglon del programa del ano. La convocatoria NO se borra ni se cancela, sigue existiendo. Solo mientras el plan es un borrador."
                    >
                      <Unlink size={15} />
                    </Button>
                  ) : null}
                  {item.status !== 'CANCELLED' && item.status !== 'EXECUTED' ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger"
                      onClick={() => onCancel(item)}
                      disabled={busy}
                      aria-label={`Cancelar la jornada ${item.offering.code}`}
                      title="Cancelar la jornada: no se va a dictar. Cancela la convocatoria, avisa a los convocados y retira sus obligaciones. Pide motivo."
                    >
                      <CalendarX2 size={15} />
                    </Button>
                  ) : null}
                </div>
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>

      {canAdd ? (
        <div className="border-t border-line px-5 py-3">
          <Button variant="ghost" size="sm" onClick={onAddSession}>
            <Plus size={15} />
            Agregar otra convocatoria
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * EL ANO DE UN VISTAZO. Doce columnas y una fila por capacitacion: es el cuadro que la gente ya
 * dibuja en una hoja de calculo, y responde la pregunta que la tabla plana no contestaba nunca
 * —"¿que toca en marzo?"— sin leer renglon por renglon.
 */
/**
 * EL CRONOGRAMA: doce columnas, una fila por capacitacion, cada jornada en su mes.
 *
 * Es el Excel que ya tenian, y su valor esta en lo que el Excel no puede hacer. Antes cada celda
 * era un circulo con "2" dentro: decia cuantas jornadas hay y nada mas, asi que para saber cual
 * era o para moverla habia que irse a otra vista. Ahora cada jornada es su propia ficha —con la
 * regional escrita y el estado en el color— y se ARRASTRA de mes, que es la operacion que de
 * verdad ocurre a lo largo del ano.
 *
 * Mover no es cosmetico: el servidor lo marca REPROGRAMADA, y esa distincion es la que separa
 * "se cumplio en su mes" de "se movio hasta que cupo". Por eso lo ejecutado no se arrastra —ya es
 * historia— y en un plan cerrado no se arrastra nada.
 */
function MonthGrid({
  groups,
  canReschedule,
  onReschedule,
}: {
  groups: ActivityGroup[];
  canReschedule: boolean;
  onReschedule: (item: PlanItemRow, month: number) => void;
}) {
  const now = new Date().getMonth() + 1;
  const [dragging, setDragging] = useState<PlanItemRow | null>(null);
  const [over, setOver] = useState<string | null>(null);

  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[980px] border-collapse">
        <thead>
          <tr className="border-b border-line">
            <th className="sticky left-0 z-10 bg-surface px-5 py-3 text-left text-xs font-medium uppercase tracking-[0.04em] text-ink-500">
              Capacitacion
            </th>
            {MONTHS.map((month, index) => (
              <th
                key={month}
                className={cn(
                  'px-1 py-3 text-center text-xs font-medium uppercase text-ink-500',
                  index + 1 === now && 'text-ink-900',
                )}
              >
                {month.slice(0, 3)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <tr key={group.activityId} className="border-b border-line last:border-0">
              <td className="sticky left-0 z-10 max-w-[280px] bg-surface px-5 py-3">
                <p className="truncate text-sm font-medium text-ink-900">{group.activityName}</p>
                <p className="truncate text-xs text-ink-500">{group.processName}</p>
              </td>
              {MONTHS.map((month, index) => {
                const monthNumber = index + 1;
                const cellId = group.activityId + '-' + monthNumber;
                const inMonth = group.items.filter((item) => item.plannedMonth === monthNumber);
                // Solo se suelta en la fila de la MISMA capacitacion: arrastrar una jornada a la
                // fila de otra no seria moverla de mes, seria convertirla en otra cosa.
                const droppable =
                  canReschedule &&
                  dragging !== null &&
                  dragging.offering.activityVersion.activity.id === group.activityId;

                return (
                  <td
                    key={month}
                    onDragOver={(event) => {
                      if (!droppable) return;
                      event.preventDefault();
                      setOver(cellId);
                    }}
                    onDragLeave={() => setOver((previous) => (previous === cellId ? null : previous))}
                    onDrop={(event) => {
                      event.preventDefault();
                      setOver(null);
                      if (droppable && dragging && dragging.plannedMonth !== monthNumber) {
                        onReschedule(dragging, monthNumber);
                      }
                      setDragging(null);
                    }}
                    aria-label={month + ' · ' + group.activityName}
                    className={cn(
                      'px-1 py-2 align-top transition-colors duration-150',
                      monthNumber === now && 'bg-paper',
                      droppable && over !== cellId && 'bg-paper/60',
                      over === cellId && 'bg-primary-soft',
                    )}
                  >
                    <div className="flex flex-col items-center gap-1">
                      {inMonth.map((item) => (
                        <SessionChip
                          key={item.id}
                          item={item}
                          movable={canReschedule && item.status !== 'EXECUTED'}
                          onDragStart={() => setDragging(item)}
                          onDragEnd={() => {
                            setDragging(null);
                            setOver(null);
                          }}
                        />
                      ))}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-wrap items-center gap-4 border-t border-line px-5 py-3 text-xs text-ink-500">
        <Legend color="var(--brand-primary)" label="Programada" />
        <Legend color="var(--ok)" label="Ejecutada" />
        <Legend color="var(--warn)" label="Reprogramada" />
        <Legend color="var(--ink-300)" label="Cancelada" />
        <span>
          {canReschedule
            ? 'Arrastra una jornada a otro mes para reprogramarla.'
            : 'Un plan cerrado ya no se reprograma.'}
        </span>
      </div>
    </div>
  );
}

/** El color dice el estado sin leer nada: es lo unico que se ve de lejos en doce columnas. */
const CHIP_COLOR: Record<PlanItemStatus, string> = {
  PLANNED: 'var(--brand-primary)',
  EXECUTED: 'var(--ok)',
  RESCHEDULED: 'var(--warn)',
  CANCELLED: 'var(--ink-300)',
};

/**
 * UNA JORNADA dentro del cronograma.
 *
 * Lleva la regional escrita y no solo un color, porque el caso que hace util esta vista es la
 * reinduccion en tres sedes: tres puntos identicos no se distinguen y "Bogota / Medellin /
 * Barranquilla" si. El resto —codigo, fecha, proyectados, capacitados— aparece al pasar por
 * encima o al enfocar con el teclado, para no convertir doce columnas en un muro de texto.
 */
function SessionChip({
  item,
  movable,
  onDragStart,
  onDragEnd,
}: {
  item: PlanItemRow;
  movable: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const [open, setOpen] = useState(false);
  const projected = item.projectedSnapshot ?? item.offering.projectedCount;
  const place = item.offering.regional?.name ?? 'Todas';

  return (
    <span className="relative">
      <Link
        href={`/convocatorias/${item.offering.id}`}
        draggable={movable}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        title={movable ? 'Arrastrala a otro mes para reprogramarla' : undefined}
        className={cn(
          'focus-ring block max-w-[92px] truncate rounded-full px-2 py-1 text-[11px] font-medium text-white transition-transform duration-150',
          movable ? 'cursor-grab active:cursor-grabbing hover:scale-[1.04]' : 'cursor-pointer',
        )}
        style={{ backgroundColor: CHIP_COLOR[item.status] }}
      >
        {place}
      </Link>

      {open ? (
        <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 block w-52 -translate-x-1/2 rounded-lg border border-line bg-surface p-3 text-left shadow-lg">
          <span className="block font-mono text-[11px] text-ink-500">{item.offering.code}</span>
          <span className="mt-0.5 block text-xs font-medium text-ink-900">{place}</span>
          {item.offering.scheduledDate ? (
            <span className="mt-0.5 block text-xs text-ink-500">{formatDate(item.offering.scheduledDate)}</span>
          ) : null}
          <span className="mt-1.5 block text-xs text-ink-700">
            {item.facts?.trained ?? 0} de {projected ?? '—'} capacitados
          </span>
          <span className="mt-1.5 block">
            <StatusPill kind={ITEM_STATUS[item.status].kind} label={ITEM_STATUS[item.status].label} />
          </span>
        </span>
      ) : null}
    </span>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
      {label}
    </span>
  );
}

function ProcessTable({ plan }: { plan: PlanDetail }) {
  if (plan.byProcess.length === 0) {
    return (
      <div className="card">
        <EmptyState icon={ShieldCheck} title="Todavia no hay nada por proceso" description="Aparece cuando el plan tenga renglones." />
      </div>
    );
  }
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-4">
        <h2 className="font-display text-base font-semibold text-ink-900">Por proceso</h2>
        <p className="mt-1 text-sm text-ink-500">
          El plan SST, el PESV y el BASC son vistas del mismo plan: cada auditor mira su parte.
        </p>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <THead>
            <Tr>
              <Th>Proceso</Th>
              <Th className="text-right">Programadas</Th>
              <Th className="text-right">Ejecutadas</Th>
              <Th className="text-right">Cumplimiento</Th>
              <Th className="text-right">Cobertura</Th>
            </Tr>
          </THead>
          <TBody>
            {plan.byProcess.map((group) => (
              <Tr key={group.process.id}>
                <Td className="font-medium text-ink-900">{group.process.name}</Td>
                <Td className="text-right tabular-nums text-ink-700">{group.metrics.programmed}</Td>
                <Td className="text-right tabular-nums text-ink-700">{group.metrics.executed}</Td>
                <Td className="text-right tabular-nums text-ink-700">{group.metrics.compliancePct}%</Td>
                <Td className="text-right tabular-nums text-ink-700">{group.metrics.coveragePct}%</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </div>
    </div>
  );
}

/**
 * LA TABLA PLANA, que no desaparece: es la vista de buscar, ordenar y exportar.
 *
 * Agrupar por capacitacion contesta "que se dicta este ano"; la tabla contesta "donde esta ESTE
 * renglon". Son dos preguntas distintas y por eso conviven en vez de sustituirse.
 */
function FlatTable({
  items,
  canRemove,
  busy,
  onRemove,
  onCancel,
  onAdjust,
}: {
  items: PlanItemRow[];
  canRemove: boolean;
  busy: boolean;
  onRemove: (itemId: string) => void;
  onCancel: (item: PlanItemRow) => void;
  onAdjust: (item: PlanItemRow) => void;
}) {
  const sorted = [...items].sort((a, b) => a.plannedMonth - b.plannedMonth);

  if (sorted.length === 0) {
    return (
      <div className="card">
        <EmptyState icon={Search} title="Nada con esos filtros" description="Prueba con otro proceso, otro mes u otro estado." />
      </div>
    );
  }

  return (
    <div className="card overflow-x-auto">
      <Table>
        <THead>
          <Tr>
            <Th className="w-24">Mes</Th>
            <Th>Capacitacion</Th>
            <Th>Proceso</Th>
            <Th>Donde</Th>
            <Th>Convocatoria</Th>
            <Th className="text-right">Proyectados</Th>
            <Th className="text-right">Capacitados</Th>
            <Th>Estado</Th>
            {canRemove ? <Th className="w-20 text-right">Accion</Th> : null}
          </Tr>
        </THead>
        <TBody>
          {sorted.map((item) => (
            <Tr key={item.id}>
              <Td className="text-ink-700">{monthName(item.plannedMonth)}</Td>
              <Td className="font-medium text-ink-900">{item.offering.activityVersion.activity.name}</Td>
              <Td className="text-ink-500">{item.offering.activityVersion.activity.process.name}</Td>
              <Td className="text-ink-700">{item.offering.regional?.name ?? 'Todas'}</Td>
              <Td>
                <Link href={`/convocatorias/${item.offering.id}`} className="focus-ring font-mono text-xs text-ink-700 hover:underline">
                  {item.offering.code}
                </Link>
              </Td>
              <Td className="text-right tabular-nums text-ink-700">
                <ProjectedCell item={item} onAdjust={onAdjust} />
              </Td>
              <Td className="text-right tabular-nums text-ink-700">{item.facts?.trained ?? 0}</Td>
              <Td>
                <StatusPill kind={ITEM_STATUS[item.status].kind} label={ITEM_STATUS[item.status].label} />
              </Td>
              <Td className="text-right">
                <div className="flex items-center justify-end gap-1">
                  {/*
                    DOS ACCIONES, NO UNA. "Quitar del plan" es *esto no va en el plan* y solo cabe
                    mientras el plan es un borrador que no obliga a nadie. "Cancelar la jornada" es
                    *esto no se va a dictar*, que es un hecho del mundo: cancela la convocatoria,
                    avisa a los convocados y retira las obligaciones. Llamar "Quitar" a las dos era
                    lo que hacia imposible saber cual estabas usando.
                  */}
                  {canRemove ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemove(item.id)}
                      disabled={busy}
                      aria-label={`Quitar del plan la convocatoria ${item.offering.code}`}
                      title="Quitar del plan: saca este renglon del programa del ano. La convocatoria NO se borra ni se cancela, sigue existiendo. Solo mientras el plan es un borrador."
                    >
                      <Unlink size={15} />
                    </Button>
                  ) : null}
                  {item.status !== 'CANCELLED' && item.status !== 'EXECUTED' ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-danger"
                      onClick={() => onCancel(item)}
                      disabled={busy}
                      aria-label={`Cancelar la jornada ${item.offering.code}`}
                      title="Cancelar la jornada: no se va a dictar. Cancela la convocatoria, avisa a los convocados y retira sus obligaciones. Pide motivo."
                    >
                      <CalendarX2 size={15} />
                    </Button>
                  ) : null}
                </div>
              </Td>
            </Tr>
          ))}
        </TBody>
      </Table>
    </div>
  );
}

/**
 * LOS PROYECTADOS, que dejan de ser texto muerto.
 *
 * Es el DENOMINADOR de la cobertura, y hasta ahora solo se podia tocar al publicar la
 * convocatoria. Pero el caso que pasa siempre es posterior: se congelaron 45 y entraron siete
 * personas al area en marzo. La regla de oro 3 ya preveia la valvula —"ajuste manual solo con
 * justificacion auditada"—; lo que faltaba era la puerta.
 *
 * Sin congelar todavia no se ofrece: ahi el numero aun se deriva solo y tocarlo a mano seria
 * inventarse un dato que el sistema va a recalcular al publicar.
 */
function ProjectedCell({ item, onAdjust }: { item: PlanItemRow; onAdjust: (item: PlanItemRow) => void }) {
  const value = item.projectedSnapshot ?? item.offering.projectedCount;
  const frozen = item.offering.status !== 'DRAFT' && value !== null && value !== undefined;

  if (!frozen) return <span className="text-ink-500">{value ?? '—'}</span>;
  return (
    <button
      type="button"
      onClick={() => onAdjust(item)}
      title="Ajustar los proyectados (pide motivo)"
      className="focus-ring rounded px-1.5 py-0.5 tabular-nums decoration-dotted underline-offset-4 hover:bg-paper hover:underline"
    >
      {value}
    </button>
  );
}

/**
 * COMO VA EL PLAN, renglon por renglon (Decision #122).
 *
 * El plan tenia un porcentaje arriba y no habia forma de saber **que renglon lo esta hundiendo**.
 * Aqui cada uno lleva su barra: se ve de un vistazo cual va bien, cual esta atrasado y —lo mas
 * util— cual no ha empezado porque nadie convoco la jornada.
 *
 * Se ordenan por mes, como el resto del plan: aqui la pregunta es "¿vamos al dia con el
 * calendario?", y para eso el orden del calendario es el que sirve.
 */
function EjecucionDelPlan({
  planId,
  metrics,
  goalPct,
}: {
  planId: string;
  metrics: PlanMetrics;
  goalPct: number | null;
}) {
  const [filas, setFilas] = useState<FilaPlan[] | null>(null);

  useEffect(() => {
    void getEjecucionDelPlan(planId)
      .then((valor) => setFilas(valor.items))
      .catch(() => setFilas([]));
  }, [planId]);

  if (!filas) return <Skeleton className="h-64 w-full rounded-xl" />;

  if (filas.length === 0) {
    return (
      <p className="card p-8 text-center text-sm text-ink-500">
        Este plan todavia no tiene renglones que seguir.
      </p>
    );
  }

  /*
    EL RESUMEN DE ESTE PLAN, sumando sus renglones. Se calcula aqui y no se pide otra vez al
    servidor: son las mismas filas que ya estan en pantalla, y pedirlo aparte abriria la puerta a
    que el total de arriba y el detalle de abajo dejaran de cuadrar.
  */
  const ejecucion = filas.reduce(
    (acumulado, fila) => ({
      total: acumulado.total + fila.resumen.total,
      terminadas: acumulado.terminadas + fila.resumen.terminadas,
      enCurso: acumulado.enCurso + fila.resumen.enCurso,
      sinEmpezar: acumulado.sinEmpezar + fila.resumen.sinEmpezar,
      atrasadas: acumulado.atrasadas + fila.resumen.atrasadas,
      reprobadas: acumulado.reprobadas + fila.resumen.reprobadas,
      esperando: acumulado.esperando + fila.resumen.esperando,
      noRealizadas: acumulado.noRealizadas + fila.resumen.noRealizadas,
      eximidas: acumulado.eximidas + fila.resumen.eximidas,
      avancePct: 0,
    }),
    {
      total: 0, terminadas: 0, enCurso: 0, sinEmpezar: 0, atrasadas: 0,
      reprobadas: 0, esperando: 0, noRealizadas: 0, eximidas: 0, avancePct: 0,
    },
  );
  // Mismo denominador que el servidor (`resumirEjecucion`): las eximidas salen, porque a esa
  // persona ya nadie le pide la formacion y dejarlas dentro pondria un techo al indicador.
  const exigibles = ejecucion.total - ejecucion.eximidas;
  ejecucion.avancePct = exigibles <= 0 ? 0 : Math.round((ejecucion.terminadas / exigibles) * 100);

  return (
    <div>
      <MedicionDelPlan metrics={metrics} ejecucion={ejecucion} goalPct={goalPct} />

      <div className="space-y-2">
        {/*
          CADA RENGLON LLEVA A SUS PERSONAS. "Reprobadas: 1" sin poder abrirlo obliga a salir del
          plan, ir a Seguimiento y buscar la formacion a mano — y entonces no se mira. El enlace
          lleva directo al detalle de esa formacion, donde los chips filtran por estado.
        */}
        {filas.map((fila) => (
          <Link
            key={fila.planItemId}
            href={`/reportes?formacion=${fila.activityId}`}
            className="focus-ring block rounded-xl transition-transform duration-150 hover:-translate-y-px"
          >
          <div className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: fila.typeColor ?? 'var(--brand-primary)' }}
                  />
                  <p className="truncate font-display text-[15px] font-semibold text-ink-900">{fila.activityName}</p>
                </div>
                <p className="mt-0.5 truncate text-xs text-ink-500">
                  {MESES[fila.plannedMonth - 1] ?? ''}
                  {fila.typeName ? ` · ${fila.typeName}` : ''}
                  {/*
                    LOS PROYECTADOS del plan al lado de los reales: si se pactaron 40 y hay 25
                    asignados, el renglon puede estar al 100% y aun asi no cubrir lo prometido. Es
                    la clase de hueco que solo se ve poniendo los dos numeros juntos.
                  */}
                  {fila.projected !== null && fila.projected !== fila.resumen.total
                    ? ` · se proyectaron ${fila.projected}`
                    : ''}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-display text-lg font-bold leading-none tabular-nums text-ink-900">
                  {fila.resumen.avancePct}%
                </p>
                <p className="mt-0.5 text-xs text-ink-500">
                  {fila.resumen.terminadas}/{fila.resumen.total}
                </p>
              </div>
            </div>
            <div className="mt-3">
              <BarraEjecucion resumen={fila.resumen} />
            </div>
          </div>
          </Link>
        ))}
      </div>

      <p className="mt-4 text-center text-xs text-ink-500">Abre un renglon para ver persona por persona.</p>

      {/*
        LOS CORTES, ACOTADOS A ESTE PLAN.

        Es el mismo motor de la analitica general, pero midiendo SOLO lo que nacio de este plan
        (regla de oro 2): quien ingreso en agosto no hace la jornada de marzo y no puede contar como
        incumplimiento suyo. Sin esto, para saber que area va peor DENTRO del plan habia que salir a
        otra pantalla y aceptar que ahi tambien contaban las pildoras y las extraordinarias.
      */}
      <div className="mt-8">
        <h3 className="font-display text-base font-semibold text-ink-900">Donde esta el problema, dentro del plan</h3>
        <p className="mb-4 mt-1 text-sm text-ink-500">
          Solo obligaciones nacidas de este plan: no cuentan las pildoras ni las extraordinarias.
        </p>
        <Analitica planId={planId} />
      </div>
    </div>
  );
}

/** Los meses en el idioma del plan. Se escriben aqui y no con `toLocaleDateString`: no hay fecha. */
const MESES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];
