import { buildAudienceWhere } from './audience-rule.js';

const CONDUCTOR = 'cargo-conductor';
const AUXILIAR = 'cargo-auxiliar';
const ANTIOQUIA = 'regional-antioquia';
const LOGISTICA = 'area-logistica';

const criterios = (parcial: Partial<Parameters<typeof buildAudienceWhere>[0]>) =>
  buildAudienceWhere({
    match: 'ALL',
    jobTitleIds: [],
    jobTitleTypeIds: [],
    areaIds: [],
    regionalIds: [],
    serviceIds: [],
    employmentTypes: [],
    roadActors: [],
    ...parcial,
  });

/**
 * A QUIENES alcanza una asignacion manual. Es la pregunta que hizo el cliente —"si elijo cargo
 * Auxiliar y regional Antioquia, ¿cuenta a todos los auxiliares o solo a los de esa regional?"— y
 * la respuesta tiene que ser: solo a los de esa regional.
 */
describe('alcance de una asignacion manual', () => {
  it('un solo criterio filtra por el', () => {
    expect(criterios({ jobTitleIds: [CONDUCTOR] })).toMatchObject({
      AND: [{ jobTitleId: { in: [CONDUCTOR] } }],
    });
  });

  it('varios valores de la MISMA dimension suman (o uno u otro cargo)', () => {
    expect(criterios({ jobTitleIds: [CONDUCTOR, AUXILIAR] })).toMatchObject({
      AND: [{ jobTitleId: { in: [CONDUCTOR, AUXILIAR] } }],
    });
  });

  // El caso que motivo el arreglo: antes esto era un OR y alcanzaba a los auxiliares de todo el
  // pais MAS a todo el mundo de Antioquia.
  it('dimensiones DISTINTAS se cruzan: auxiliares Y de Antioquia', () => {
    const where = criterios({ jobTitleIds: [AUXILIAR], regionalIds: [ANTIOQUIA] });
    expect(where).toMatchObject({
      AND: [{ jobTitleId: { in: [AUXILIAR] } }, { regionalId: { in: [ANTIOQUIA] } }],
    });
    expect(where).not.toHaveProperty('OR');
  });

  it('cruza las tres a la vez', () => {
    expect(criterios({ jobTitleIds: [AUXILIAR], areaIds: [LOGISTICA], regionalIds: [ANTIOQUIA] })).toMatchObject({
      AND: [
        { jobTitleId: { in: [AUXILIAR] } },
        // El area alcanza tambien a sus SUB-AREAS (2026-09-17): ya no es una igualdad sobre
        // `areaId` sino un filtro de relacion. Ver la faceta de area en `audience-rule.ts`.
        { area: { OR: [{ id: { in: [LOGISTICA] } }, { parentId: { in: [LOGISTICA] } }] } },
        { regionalId: { in: [ANTIOQUIA] } },
      ],
    });
  });

  it('sin criterios alcanza a toda la empresa, y por eso la pantalla no deja guardar en vacio', () => {
    expect(criterios({})).not.toHaveProperty('AND');
  });
});
