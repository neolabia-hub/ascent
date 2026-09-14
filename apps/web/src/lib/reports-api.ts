import { apiFetch } from './api';
import { descargarArchivo } from './certificates-api';

export type EstadoEjecucion =
  | 'ESPERANDO'
  | 'SIN_EMPEZAR'
  | 'EN_CURSO'
  | 'REPROBADA'
  | 'TERMINADA'
  | 'ATRASADA'
  /** Cerro el periodo sin hacerla (Decision #142). Es incumplimiento, y hay que verlo. */
  | 'NO_REALIZADA'
  /** Eximida con motivo: ni cumplimiento ni incumplimiento. Fuera del porcentaje. */
  | 'EXIMIDA';

export interface ResumenEjecucion {
  total: number;
  terminadas: number;
  enCurso: number;
  sinEmpezar: number;
  atrasadas: number;
  reprobadas: number;
  esperando: number;
  noRealizadas: number;
  eximidas: number;
  /**
   * Terminadas sobre el total MENOS las eximidas. Las que esperan convocatoria CUENTAN en el
   * denominador; las eximidas no, porque a esa persona ya nadie le pide la formacion.
   */
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
  /** Cuantos ciclos tuvo esta obligacion. La fila es UNA sola (la mas relevante); esto dice si hubo historia detras. */
  rondas: number;
}

export function getEjecucionGeneral(): Promise<{ items: FilaGeneral[]; resumen: ResumenEjecucion }> {
  return apiFetch('/reportes/ejecucion', { method: 'GET' });
}

export interface RachaCumplimiento {
  currentDays: number;
  longestDays: number;
}

/** Dias seguidos con cero vencidos, para el titular de Inicio (`PENDIENTES` 8.3). */
export function getRachaCumplimiento(): Promise<RachaCumplimiento> {
  return apiFetch('/reportes/racha-cumplimiento', { method: 'GET' });
}

export function getEjecucionDeActividad(
  activityId: string,
): Promise<{ items: FilaPersona[]; resumen: ResumenEjecucion }> {
  return apiFetch(`/reportes/actividades/${activityId}/ejecucion`, { method: 'GET' });
}

export function getEjecucionDelPlan(planId: string): Promise<{ items: FilaPlan[] }> {
  return apiFetch(`/reportes/planes/${planId}/ejecucion`, { method: 'GET' });
}

/** Un dia en el nombre del archivo: con tres descargas en la misma carpeta, sin el no se sabe cual es cual. */
function hoyEnElNombre(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * EL ARCHIVO SALE CON EL FILTRO QUE ESTE PUESTO.
 *
 * Exportar siempre el universo entero obligaria a repetir en Excel el recorte que se acaba de hacer
 * en pantalla. Y al reves —exportar solo lo filtrado sin decirlo— convierte doce filas en "todo lo
 * que hay": por eso el filtro tambien viaja escrito DENTRO del archivo.
 */
export function descargarEjecucionGeneralXlsx(estado: EstadoEjecucion | null): Promise<void> {
  const query = estado ? `?estado=${estado}` : '';
  return descargarArchivo(`/reportes/ejecucion/xlsx${query}`, `seguimiento-${hoyEnElNombre()}.xlsx`);
}

export function descargarEjecucionDeActividadXlsx(
  activityId: string,
  nombreFormacion: string,
  estado: EstadoEjecucion | null,
): Promise<void> {
  const query = estado ? `?estado=${estado}` : '';
  // El nombre de la formacion en el archivo, sin lo que Windows no admite en un nombre de fichero.
  const limpio = nombreFormacion.replace(/[\\/:*?"<>|]/g, '').trim().slice(0, 60) || 'formacion';
  return descargarArchivo(
    `/reportes/actividades/${activityId}/ejecucion/xlsx${query}`,
    `seguimiento-${limpio}-${hoyEnElNombre()}.xlsx`,
  );
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
  // NO REALIZADA va en rojo con REPROBADA: las dos son resultados adversos cerrados, y esta ademas
  // ya no se puede arreglar — el periodo paso. Distinguirla de "atrasada" (ambar, todavia se hace)
  // es justo lo que la Decision #142 existe para poder decir.
  NO_REALIZADA: { label: 'No realizada', chip: 'bg-danger-soft text-danger', punto: 'var(--danger)' },
  EXIMIDA: { label: 'Eximida', chip: 'bg-paper text-ink-500', punto: 'var(--line-strong)' },
};

/** El orden en que se listan: primero lo que hay que mirar. */
export const ORDEN_ESTADOS: EstadoEjecucion[] = [
  'ATRASADA',
  'NO_REALIZADA',
  'REPROBADA',
  'ESPERANDO',
  'EN_CURSO',
  'SIN_EMPEZAR',
  'TERMINADA',
  // La ultima a proposito: no hay nada que hacer con ella, solo consta.
  'EXIMIDA',
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
    NO_REALIZADA: resumen.noRealizadas,
    EXIMIDA: resumen.eximidas,
  };
}
