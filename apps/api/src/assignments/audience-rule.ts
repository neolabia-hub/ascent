import type { Prisma } from '@prisma/client';
import type { AudienceRule } from '@neo-pulse/shared';

/**
 * Regla de audiencia: UNA definicion, dos derivaciones.
 *
 * El mismo listado de facetas produce (a) el filtro que busca a los miembros en la base y (b) el
 * predicado que responde "esta persona pertenece?" en memoria. Se define una sola vez a
 * proposito: si el filtro y el predicado fueran codigo separado, la lista de la pantalla y las
 * obligaciones que nacen podrian discrepar, y eso en cumplimiento es un hallazgo de auditoria.
 */

/** Datos de la persona que la regla puede mirar. */
export interface PersonProfile {
  jobTitleId: string;
  jobTitleTypeId: string;
  areaId: string;
  regionalId: string | null;
  serviceId: string | null;
  employmentType: string;
  roadActor: string | null;
}

interface Facet {
  where: Prisma.UserWhereInput;
  matches: (person: PersonProfile) => boolean;
}

/** Quien puede pertenecer a una audiencia: persona viva de la empresa. */
export const ELIGIBLE_MEMBER: Prisma.UserWhereInput = {
  active: true,
  deletedAt: null,
  terminatedAt: null,
};

function facetsOf(rule: AudienceRule): Facet[] {
  const facets: Facet[] = [];
  if (rule.jobTitleIds.length > 0) {
    facets.push({
      where: { jobTitleId: { in: rule.jobTitleIds } },
      matches: (p) => rule.jobTitleIds.includes(p.jobTitleId),
    });
  }
  if (rule.jobTitleTypeIds.length > 0) {
    facets.push({
      where: { jobTitle: { jobTitleTypeId: { in: rule.jobTitleTypeIds } } },
      matches: (p) => rule.jobTitleTypeIds.includes(p.jobTitleTypeId),
    });
  }
  if (rule.areaIds.length > 0) {
    facets.push({
      where: { areaId: { in: rule.areaIds } },
      matches: (p) => rule.areaIds.includes(p.areaId),
    });
  }
  if (rule.regionalIds.length > 0) {
    facets.push({
      where: { regionalId: { in: rule.regionalIds } },
      matches: (p) => p.regionalId !== null && rule.regionalIds.includes(p.regionalId),
    });
  }
  if (rule.serviceIds.length > 0) {
    facets.push({
      where: { serviceId: { in: rule.serviceIds } },
      // Quien no tiene servicio puesto NO entra: no se adivina. Una empresa que no use servicios
      // simplemente no usa este criterio, y todo lo demas le sigue funcionando igual.
      matches: (p) => p.serviceId !== null && rule.serviceIds.includes(p.serviceId),
    });
  }
  if (rule.employmentTypes.length > 0) {
    facets.push({
      where: { employmentType: { in: rule.employmentTypes } },
      matches: (p) => (rule.employmentTypes as string[]).includes(p.employmentType),
    });
  }
  if (rule.roadActors.length > 0) {
    facets.push({
      where: { roadActor: { in: rule.roadActors } },
      matches: (p) => p.roadActor !== null && (rule.roadActors as string[]).includes(p.roadActor),
    });
  }
  return facets;
}

/** Filtro de personas que hoy pertenecen a la audiencia. Sin facetas = toda la empresa. */
export function buildAudienceWhere(rule: AudienceRule): Prisma.UserWhereInput {
  const facets = facetsOf(rule);
  if (facets.length === 0) return { ...ELIGIBLE_MEMBER };
  const conditions = facets.map((f) => f.where);
  return rule.match === 'ANY' ? { ...ELIGIBLE_MEMBER, OR: conditions } : { ...ELIGIBLE_MEMBER, AND: conditions };
}

/** Misma decision que el filtro, resuelta en memoria (sincronizacion de una sola persona). */
export function personMatchesRule(person: PersonProfile, rule: AudienceRule): boolean {
  const facets = facetsOf(rule);
  if (facets.length === 0) return true;
  return rule.match === 'ANY' ? facets.some((f) => f.matches(person)) : facets.every((f) => f.matches(person));
}

/** Una regla sin facetas alcanza a TODA la empresa: la pantalla debe decirlo antes de guardar. */
export function ruleReachesEveryone(rule: AudienceRule): boolean {
  return facetsOf(rule).length === 0;
}

/**
 * Cargo al que apunta una audiencia de UN SOLO cargo, o null si es mas ancha.
 *
 * La matriz cargo -> actividad solo administra estas: se reconocen por su FORMA, no por su
 * nombre. Asi, renombrar la audiencia no desconecta la matriz, y una audiencia mas amplia
 * ("conductores de Antioquia") nunca se edita por accidente desde una casilla de la matriz.
 */
export function singleJobTitleOf(rule: AudienceRule): string | null {
  const onlyFacet = facetsOf(rule).length === 1;
  return onlyFacet && rule.jobTitleIds.length === 1 ? (rule.jobTitleIds[0] as string) : null;
}
