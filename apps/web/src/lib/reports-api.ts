import { apiFetch } from './api';

export type EstadoEjecucion = 'ESPERANDO' | 'SIN_EMPEZAR' | 'EN_CURSO' | 'REPROBADA' | 'TERMINADA' | 'ATRASADA';

export interface ResumenEjecucion {
  total: number;
  terminadas: number;
  enCurso: number;
  sinEmpezar: number;
  atrasadas: number;
  reprobadas: number;
  esperando: number;
  /** Terminadas sobre el total. Las que esperan convocatoria CUENTAN en el denominador. */
  avancePct: number;
}

export interface FilaGeneral {
  activityId: string;
  activityName: string;
  typeName: string | null;
  typeColor: string | null;
  processName: string | null;
  resumen: ResumenEjecucion;
}

export interface FilaPlan {
  planItemId: string;
  activityId: string;
  activityName: string;
  typeName: string | null;
  typeColor: string | null;
  plannedMonth: number;
  status: string;
  /** Participantes congelados al aprobar el plan: el denominador que se pacto. */
  projected: number | null;
  resumen: ResumenEjecucion;
}

export interface FilaPersona {
  assignmentId: string;
  userId: string;
  fullName: string;
  documentNumber: string;
  area: string | null;
  jobTitle: string | null;
  estado: EstadoEjecucion;
  dueAt: string | null;
  cycleNumber: number | null;
  enrollmentId: string | null;
  versionNumber: number | null;
  completedAt: string | null;
  intentos: number;
  mejorNota: number | null;
  /** `POSITIVE` / `NEGATIVE` / `NA`, o `null` si no la respondio. */
  encuesta: string | null;
  respondioEncuesta: boolean;
  certificadoId: string | null;
}

export function getEjecucionGeneral(): Promise<{ items: FilaGeneral[]; resumen: ResumenEjecucion }> {
  return apiFetch('/reportes/ejecucion', { method: 'GET' });
}

export function getEjecucionDeActividad(
  activityId: string,
): Promise<{ items: FilaPersona[]; resumen: ResumenEjecucion }> {
  return apiFetch(`/reportes/actividades/${activityId}/ejecucion`, { method: 'GET' });
}

export function getEjecucionDelPlan(planId: string): Promise<{ items: FilaPlan[] }> {
  return apiFetch(`/reportes/planes/${planId}/ejecucion`, { method: 'GET' });
}

/**
 * COMO SE PINTA CADA ESTADO, en un solo sitio.
 *
 * Lo usan la tabla de personas, los chips de filtro y el desglose de la barra. Con tres copias, el
 * dia que "esperando" deje de ser gris lo sera en dos de los tres y nadie lo notara hasta que
 * alguien pregunte por que el mismo estado se ve distinto en la misma pantalla.
 *
 * NADA EN ROJO salvo lo reprobado, que es el unico resultado adverso de verdad. Atrasado va en
 * ambar —se hace y ya— y esperando en NEUTRO, porque no es un fallo de nadie: es que la empresa no
 * ha convocado (Decision #102).
 */
export const ESTADOS: Record<EstadoEjecucion, { label: string; chip: string; punto: string }> = {
  TERMINADA: { label: 'Terminada', chip: 'bg-ok-soft text-ok', punto: 'var(--ok)' },
  EN_CURSO: { label: 'En curso', chip: 'bg-primary-soft text-primary', punto: 'var(--brand-primary)' },
  SIN_EMPEZAR: { label: 'Sin empezar', chip: 'bg-paper text-ink-700', punto: 'var(--ink-300)' },
  ATRASADA: { label: 'Atrasada', chip: 'bg-warn-soft text-warn', punto: 'var(--warn)' },
  REPROBADA: { label: 'Reprobada', chip: 'bg-danger-soft text-danger', punto: 'var(--danger)' },
  ESPERANDO: { label: 'Esperando convocatoria', chip: 'bg-paper text-ink-500', punto: 'var(--line-strong)' },
};

/** El orden en que se listan: primero lo que hay que mirar. */
export const ORDEN_ESTADOS: EstadoEjecucion[] = [
  'ATRASADA',
  'REPROBADA',
  'ESPERANDO',
  'EN_CURSO',
  'SIN_EMPEZAR',
  'TERMINADA',
];

/** Cuantos hay de cada estado en un resumen, para pintar la barra y los chips. */
export function conteoPorEstado(resumen: ResumenEjecucion): Record<EstadoEjecucion, number> {
  return {
    ATRASADA: resumen.atrasadas,
    REPROBADA: resumen.reprobadas,
    ESPERANDO: resumen.esperando,
    EN_CURSO: resumen.enCurso,
    SIN_EMPEZAR: resumen.sinEmpezar,
    TERMINADA: resumen.terminadas,
  };
}
