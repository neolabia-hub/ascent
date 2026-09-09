import { apiFetch } from './api';
import type { EstadoEjecucion, ResumenEjecucion } from './reports-api';

/**
 * ANALITICA Y VENCIMIENTOS (Decisiones #125 y #126).
 *
 * El seguimiento contesta "¿como va cada formacion?". Esto contesta las dos preguntas que se hacen
 * en un comite y que no se pueden sacar de una lista de doscientas formaciones: **¿donde esta el
 * problema?** (cortes por area, regional, norma...) y **¿que se me viene encima?** (vencimientos).
 */

export type Dimension = 'area' | 'cargo' | 'regional' | 'servicio' | 'proceso' | 'tipo' | 'norma';

export const DIMENSION_LABEL: Record<Dimension, string> = {
  area: 'Por área',
  cargo: 'Por cargo',
  regional: 'Por regional',
  servicio: 'Por servicio',
  proceso: 'Por proceso',
  tipo: 'Por tipo de formación',
  norma: 'Por norma',
};

export interface GrupoAnalitica {
  id: string | null;
  label: string;
  resumen: ResumenEjecucion;
}

export interface CorteAnalitica {
  dimension: Dimension;
  grupos: GrupoAnalitica[];
  resumen: ResumenEjecucion;
  /** Solo lo dispara "por norma": una formacion puede responder a varias a la vez. */
  sumaMasQueElTotal: boolean;
}

export interface Analitica {
  resumen: ResumenEjecucion;
  dimensiones: CorteAnalitica[];
}

/** `planId` acota a lo que nacio del plan; sin el, toda la ejecucion viva. */
export function getAnalitica(planId?: string | null): Promise<Analitica> {
  return apiFetch(`/reportes/analitica${planId ? `?plan=${planId}` : ''}`, { method: 'GET' });
}

/**
 * QUE HAY QUE HACER CON LA FILA, que es el eje del informe desde el 2026-09-08.
 *
 * Antes partia por de donde salia el dato —«Certificacion» / «Obligacion»—, que es una division del
 * esquema y no del trabajo: a quien esta en su ventana de 60 dias se le contaba en las dos series.
 * Ahora cada persona y formacion sale UNA vez, del lado que dice que hacer (`expirations.ts`).
 */
export type ClaseVencimiento = 'REPROGRAMAR' | 'PERSEGUIR';

/** De donde sale la fecha. No decide nada, pero contesta el "¿segun que?" de quien lo lee. */
export type FuenteVencimiento = 'PAPEL_DE_TERCERO' | 'CONSTANCIA' | 'OBLIGACION_ABIERTA';

export interface FilaVencimiento {
  clase: ClaseVencimiento;
  fuente: FuenteVencimiento;
  fecha: string;
  personaId: string;
  personaNombre: string;
  documento: string;
  area: string | null;
  cargo: string | null;
  regional: string | null;
  formacion: string;
  actividadId: string | null;
}

export interface MesVencimientos {
  /** 'YYYY-MM'. */
  mes: string;
  reprogramar: number;
  perseguir: number;
  total: number;
}

export interface Vencimientos {
  resumen: { vencido: number; proximos30: number; proximos90: number; total: number };
  calendario: MesVencimientos[];
  items: FilaVencimiento[];
}

export function getVencimientos(meses = 12): Promise<Vencimientos> {
  return apiFetch(`/reportes/vencimientos?meses=${meses}`, { method: 'GET' });
}

/**
 * Como se nombra y se pinta cada clase de vencimiento.
 *
 * Son CATEGORIAS, no estados: a quien se le caduca una acreditacion no ha fallado en nada —lo hizo
 * bien y el papel tiene fecha— asi que no lleva el color de "atrasado". Los dos tonos estan
 * validados para daltonismo y contraste en los dos temas (ver `globals.css`).
 *
 * Los nombres son VERBOS a proposito: el informe existe para decidir que se hace, y "Certificacion"
 * frente a "Obligacion" obligaba a traducir mentalmente de que tabla salia cada barra.
 */
export const CLASES: Record<ClaseVencimiento, { label: string; plural: string; color: string }> = {
  REPROGRAMAR: { label: 'Reprogramar', plural: 'Hay que volver a convocarlas', color: 'var(--serie-1)' },
  PERSEGUIR: { label: 'Perseguir', plural: 'Nunca la han hecho', color: 'var(--serie-2)' },
};

/** Segun que se dice que vence. Se enseña en la fila: un informe que no lo dice se discute. */
export const FUENTES: Record<FuenteVencimiento, string> = {
  PAPEL_DE_TERCERO: 'Papel de un tercero',
  CONSTANCIA: 'Constancia propia',
  OBLIGACION_ABIERTA: 'Plazo de la obligación',
};

/** '2026-09' -> 'sep 26'. En un calendario de doce meses el año importa: hay dos eneros. */
export function nombreDeMes(clave: string): string {
  const [anio, mes] = clave.split('-').map(Number);
  if (!anio || !mes) return clave;
  const fecha = new Date(Date.UTC(anio, mes - 1, 1));
  return fecha
    .toLocaleDateString('es-CO', { month: 'short', year: '2-digit', timeZone: 'UTC' })
    .replace('.', '');
}

export type { EstadoEjecucion, ResumenEjecucion };

// ── Evolucion del año ─────────────────────────────────────────────────────

/** Un mes del año: lo que vencia y lo que se cumplio. `pct` es `null` si no vencia nada. */
export interface MesDeEvolucion {
  mes: number;
  vencian: number;
  cumplidas: number;
  aTiempo: number;
  pct: number | null;
}

export interface Evolucion {
  year: number;
  meses: MesDeEvolucion[];
  resumen: { vencian: number; cumplidas: number; aTiempo: number; pct: number | null };
}

/**
 * COMO FUE EL AÑO, MES A MES (2026-09-09).
 *
 * El resto de los informes es una foto de hoy. Esto contesta la otra pregunta, la del comite
 * mensual: «de lo que habia que hacer en marzo, ¿cuanto se hizo?». No es un historico del
 * indicador —nadie guardo cuanto marcaba el 1 de marzo— y por eso se cuenta por FECHA DE
 * VENCIMIENTO, que si esta guardada.
 */
export function getEvolucion(year?: number): Promise<Evolucion> {
  return apiFetch(`/reportes/evolucion${year ? `?year=${year}` : ''}`, { method: 'GET' });
}

// ── En que falla la gente ─────────────────────────────────────────────────

export interface TemaDeConocimiento {
  categoryId: string | null;
  name: string;
  preguntas: number;
  respuestas: number;
  /** Porcentaje de PUNTOS obtenidos sobre posibles. `null` si no hay nada calificado. */
  aciertoPct: number | null;
}

export interface PreguntaFallada {
  questionVersionId: string;
  stem: string;
  categoryName: string | null;
  respuestas: number;
  aciertoPct: number | null;
}

export interface Conocimiento {
  porTema: TemaDeConocimiento[];
  peoresPreguntas: PreguntaFallada[];
}

/**
 * EN QUE FALLA LA GENTE (2026-09-09).
 *
 * Los demas informes dicen cuantos aprobaron. Este dice QUE fallaron, que es lo unico que se
 * convierte directamente en una formacion del año siguiente.
 */
export function getConocimiento(): Promise<Conocimiento> {
  return apiFetch('/reportes/conocimiento', { method: 'GET' });
}
