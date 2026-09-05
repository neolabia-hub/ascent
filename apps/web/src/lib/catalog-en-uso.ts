import { ApiError } from '@/lib/api';

/**
 * EL "NO SE PUEDE BORRAR" Y SU MOTIVO, EN UN SOLO SITIO.
 *
 * La API responde al 409 de borrado con cuantas filas usan el registro y como se llaman
 * (`CATALOG_IN_USE`, ver `catalogs.service.ts`). Sin leer ese desglose, la pantalla acaba
 * enseniando el titulo pelado del error —"Conflict Exception"— que no le dice nada a nadie y hace
 * que se vuelva a intentar.
 *
 * Vivia dentro de `catalog-manager.tsx` y solo lo aprovechaban los ocho catalogos genericos. La
 * pantalla de Tipos de formacion tiene su propio borrado y se quedo fuera: el cliente se topo con
 * el mensaje mudo el 2026-09-01 intentando borrar un tipo que dejo un script de demo. Se saca aqui
 * para que las dos lean lo mismo.
 */

/** Lo que la API responde al 409 de borrado: cuantas filas lo usan y como se llaman. */
export interface EnUso {
  references: number;
  usedBy: { count: number; label: string }[];
}

/**
 * Lee el desglose del 409 si viene; si no, devuelve `null` para caer al mensaje generico en vez de
 * inventar cifras.
 */
export function leerEnUso(error: unknown): EnUso | null {
  if (!(error instanceof ApiError) || error.code !== 'CATALOG_IN_USE') return null;
  const { references, usedBy } = error.body as { references?: unknown; usedBy?: unknown };
  if (typeof references !== 'number' || !Array.isArray(usedBy)) return null;
  const filas = usedBy.filter(
    (u): u is { count: number; label: string } =>
      typeof u === 'object' &&
      u !== null &&
      typeof (u as { count?: unknown }).count === 'number' &&
      typeof (u as { label?: unknown }).label === 'string',
  );
  return { references, usedBy: filas };
}

/** "3 formaciones", "3 formaciones y 1 persona", "2 procesos, 1 persona y 4 formaciones". */
export function frasearUso(usedBy: EnUso['usedBy']): string {
  const partes = usedBy.map((u) => `${u.count} ${u.label}`);
  if (partes.length <= 1) return partes[0] ?? 'otros registros';
  return `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}`;
}
