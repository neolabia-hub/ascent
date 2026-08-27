/** Formatos de presentacion en es-CO (skill pulse-ui, seccion 5: "25 ago 2026"). */

export const MONTHS = [
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
] as const;

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatNumber(value: number): string {
  return value.toLocaleString('es-CO');
}

export function monthName(month: number): string {
  return MONTHS[month - 1] ?? String(month);
}

/** Dias respecto al disparador, dicho como lo diria una persona. */
export function describeDueOffset(days: number | null | undefined): string {
  if (days === null || days === undefined || days === 0) return 'el mismo dia';
  if (days < 0) return `${Math.abs(days)} ${Math.abs(days) === 1 ? 'dia' : 'dias'} antes`;
  return `${days} ${days === 1 ? 'dia' : 'dias'} despues`;
}
