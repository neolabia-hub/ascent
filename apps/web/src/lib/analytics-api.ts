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
  area: 'Por area',
  cargo: 'Por cargo',
  regional: 'Por regional',
  servicio: 'Por servicio',
  proceso: 'Por proceso',
  tipo: 'Por tipo de formacion',
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

export type ClaseVencimiento = 'CERTIFICACION' | 'OBLIGACION';

export interface FilaVencimiento {
  clase: ClaseVencimiento;
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
  certificaciones: number;
  obligaciones: number;
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
 * Son CATEGORIAS, no estados: una certificacion que caduca no es un fallo de nadie —la persona lo
 * hizo bien y el papel tiene fecha— asi que no lleva el color de "atrasado". Los dos tonos estan
 * validados para daltonismo y contraste en los dos temas (ver `globals.css`).
 */
export const CLASES: Record<ClaseVencimiento, { label: string; plural: string; color: string }> = {
  CERTIFICACION: { label: 'Certificacion', plural: 'Certificaciones que caducan', color: 'var(--serie-1)' },
  OBLIGACION: { label: 'Obligacion', plural: 'Formaciones por hacer', color: 'var(--serie-2)' },
};

/** '2026-09' -> 'sep 26'. En un calendario de doce meses el ano importa: hay dos eneros. */
export function nombreDeMes(clave: string): string {
  const [anio, mes] = clave.split('-').map(Number);
  if (!anio || !mes) return clave;
  const fecha = new Date(Date.UTC(anio, mes - 1, 1));
  return fecha
    .toLocaleDateString('es-CO', { month: 'short', year: '2-digit', timeZone: 'UTC' })
    .replace('.', '');
}

export type { EstadoEjecucion, ResumenEjecucion };
