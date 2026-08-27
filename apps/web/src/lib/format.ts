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

/**
 * Fecha limite dicha como se la diria un jefe a su gente: en dias, no en calendario.
 *
 * Se compara por DIA CIVIL y no por instante: una fecha de hoy a las 5 p. m. es "vence hoy",
 * no "vence en 0 dias", y una de ayer es "vencio hace 1 dia" aunque falten horas para las 24.
 */
export function describeDueDate(value: string | null | undefined, now: Date = new Date()): string {
  if (!value) return 'Sin fecha limite';

  const startOfDay = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const due = new Date(value);
  const days = Math.round((startOfDay(due) - startOfDay(now)) / (24 * 60 * 60 * 1000));

  if (days === 0) return 'Vence hoy';
  if (days === 1) return 'Vence manana';
  if (days > 1) return `Vence en ${days} dias`;
  if (days === -1) return 'Vencio ayer';
  return `Vencio hace ${Math.abs(days)} dias`;
}

/** Dias respecto al disparador, dicho como lo diria una persona. */
export function describeDueOffset(days: number | null | undefined): string {
  if (days === null || days === undefined || days === 0) return 'el mismo dia';
  if (days < 0) return `${Math.abs(days)} ${Math.abs(days) === 1 ? 'dia' : 'dias'} antes`;
  return `${days} ${days === 1 ? 'dia' : 'dias'} despues`;
}
