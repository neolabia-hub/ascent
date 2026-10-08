import type { PermissionCode } from '@neo-pulse/shared';
import type { TenantPrisma } from '../prisma/prisma.service.js';
import { processScopeWhere, tipoScopeWhere, type AnalystScope } from './analyst-scope.js';

/**
 * DE QUE FORMACIONES PUEDE VER ESTA PERSONA A LA GENTE Y SUS RESULTADOS (2026-10-07). `null` = todas.
 *
 * ─── EL HUECO ───
 *
 * Seguimiento pedia `reports:read_scope` —«ver los informes de mi alcance»— y no aplicaba alcance
 * alguno: un analista veia en Seguimiento y en Inicio a la empresa entera, con nombres, cedulas y
 * notas, aunque en Formaciones y en Convocatorias solo viera lo suyo. `reports:read_all` existia
 * desde el Sprint 1 y no cambiaba nada. Lo mismo pasaba en Asignaciones y en el aviso semanal de
 * vencimientos. Lo vio el cliente: *"solo debe salir lo que tenga asignado; solo por permiso pueden
 * ver todo"*.
 *
 * ─── LA REGLA ───
 *
 *   - con el permiso de «ver todo» de esa pantalla (por rol o concedido a la persona): todo;
 *   - sin el: las formaciones de SU ALCANCE —los procesos y los tipos que tiene asignados, lo mismo
 *     que ve en Formaciones— mas las que creo o de las que es responsable.
 *
 * Aqui NO vale el «sin alcance configurado se ve todo» del catalogo (`analyst-scope.ts`). Alla es
 * comodo y no expone a nadie: son fichas de formaciones. Aqui son personas con su resultado, asi que
 * verlo todo se concede a proposito. Quien no tiene alcance ni permiso ve lo que es suyo.
 *
 * Se acota por FORMACION, no por persona: de una formacion que le toca ve a todos los que la deben,
 * que es para lo que la tiene asignada.
 *
 * Vive en `common` porque lo aplican tres sitios que no se conocen —los informes, la lista de
 * obligaciones y el aviso semanal— y tienen que decidir igual.
 */
export interface QuienMira {
  id: string;
  hasPermission: (code: PermissionCode) => boolean;
  scopeProcessIds: AnalystScope;
  scopeActivityTypeIds: string[] | null;
}

export async function formacionesVisibles(
  db: TenantPrisma,
  quien: QuienMira,
  verTodo: PermissionCode,
): Promise<string[] | null> {
  if (quien.hasPermission(verTodo)) return null;
  const conAlcance = quien.scopeProcessIds !== null || quien.scopeActivityTypeIds !== null;
  const filas = await db.activity.findMany({
    where: {
      OR: [
        ...(conAlcance
          ? [{ ...processScopeWhere(quien.scopeProcessIds), ...tipoScopeWhere(quien.scopeActivityTypeIds) }]
          : []),
        { createdBy: quien.id },
        { versions: { some: { responsibleUserId: quien.id } } },
      ],
    },
    select: { id: true },
  });
  return filas.map((fila) => fila.id);
}
