import { audienceRuleSchema } from '@neo-pulse/shared';
import {
  buildAudienceWhere,
  personMatchesRule,
  ruleReachesEveryone,
  sameAudienceRule,
  singleJobTitleOf,
  type PersonProfile,
} from './audience-rule.js';

// Las reglas guardan ids reales del catalogo: los ids del ejemplo son UUID como los de verdad.
const CARGO_CONDUCTOR = '11111111-1111-4111-8111-111111111111';
const CARGO_ANALISTA = '22222222-2222-4222-8222-222222222222';
const TIPO_OPERATIVO = '33333333-3333-4333-8333-333333333333';
const TIPO_ADMINISTRATIVO = '44444444-4444-4444-8444-444444444444';
const AREA_LOGISTICA = '55555555-5555-4555-8555-555555555555';
const AREA_GESTION_HUMANA = '66666666-6666-4666-8666-666666666666';
const REGIONAL_NEIVA = '77777777-7777-4777-8777-777777777777';
const REGIONAL_CALI = '88888888-8888-4888-8888-888888888888';

const conductor: PersonProfile = {
  jobTitleId: CARGO_CONDUCTOR,
  jobTitleTypeId: TIPO_OPERATIVO,
  areaId: AREA_LOGISTICA,
  regionalId: REGIONAL_NEIVA,
  serviceId: null,
  employmentType: 'DIRECTO',
  roadActor: 'CONDUCTOR',
};

const analista: PersonProfile = {
  jobTitleId: CARGO_ANALISTA,
  jobTitleTypeId: TIPO_ADMINISTRATIVO,
  areaId: AREA_GESTION_HUMANA,
  regionalId: null,
  serviceId: null,
  employmentType: 'CONTRATISTA',
  roadActor: null,
};

const rule = (partial: Record<string, unknown>) => audienceRuleSchema.parse(partial);

describe('regla de audiencia', () => {
  it('sin facetas alcanza a toda la empresa', () => {
    const everyone = rule({});
    expect(ruleReachesEveryone(everyone)).toBe(true);
    expect(personMatchesRule(conductor, everyone)).toBe(true);
    expect(personMatchesRule(analista, everyone)).toBe(true);
  });

  it('ALL exige que se cumplan todas las facetas', () => {
    const conductoresDeNeiva = rule({ jobTitleIds: [CARGO_CONDUCTOR], regionalIds: [REGIONAL_NEIVA] });
    expect(personMatchesRule(conductor, conductoresDeNeiva)).toBe(true);
    expect(personMatchesRule({ ...conductor, regionalId: REGIONAL_CALI }, conductoresDeNeiva)).toBe(false);
  });

  it('ANY basta con una faceta', () => {
    const operativosOContratistas = rule({
      match: 'ANY',
      jobTitleTypeIds: [TIPO_OPERATIVO],
      employmentTypes: ['CONTRATISTA'],
    });
    expect(personMatchesRule(conductor, operativosOContratistas)).toBe(true);
    expect(personMatchesRule(analista, operativosOContratistas)).toBe(true);
    expect(personMatchesRule({ ...analista, employmentType: 'DIRECTO' }, operativosOContratistas)).toBe(false);
  });

  it('quien no tiene regional no entra en una regla por regional', () => {
    const porRegional = rule({ regionalIds: [REGIONAL_NEIVA] });
    expect(personMatchesRule(analista, porRegional)).toBe(false);
  });

  it('el filtro de base y el predicado en memoria describen las MISMAS condiciones', () => {
    const conductoresDeNeiva = rule({ jobTitleIds: [CARGO_CONDUCTOR], regionalIds: [REGIONAL_NEIVA] });
    const where = buildAudienceWhere(conductoresDeNeiva);
    expect(where).toEqual({
      active: true,
      deletedAt: null,
      terminatedAt: null,
      AND: [{ jobTitleId: { in: [CARGO_CONDUCTOR] } }, { regionalId: { in: [REGIONAL_NEIVA] } }],
    });
  });

  it('el filtro nunca alcanza a inactivos ni retirados', () => {
    expect(buildAudienceWhere(rule({}))).toMatchObject({ active: true, deletedAt: null, terminatedAt: null });
  });

  it('la matriz solo administra audiencias de un unico cargo', () => {
    expect(singleJobTitleOf(rule({ jobTitleIds: [CARGO_CONDUCTOR] }))).toBe(CARGO_CONDUCTOR);
    expect(singleJobTitleOf(rule({ jobTitleIds: [CARGO_CONDUCTOR], areaIds: [AREA_LOGISTICA] }))).toBeNull();
    expect(singleJobTitleOf(rule({ jobTitleIds: [CARGO_CONDUCTOR, CARGO_ANALISTA] }))).toBeNull();
    expect(singleJobTitleOf(rule({}))).toBeNull();
  });
});

describe('reconocer la misma audiencia', () => {
  it('el orden dentro de una faceta no la cambia', () => {
    expect(
      sameAudienceRule(
        rule({ jobTitleIds: [CARGO_CONDUCTOR, CARGO_ANALISTA] }),
        rule({ jobTitleIds: [CARGO_ANALISTA, CARGO_CONDUCTOR] }),
      ),
    ).toBe(true);
  });

  it('dos audiencias de toda la empresa son la misma', () => {
    expect(sameAudienceRule(rule({}), rule({}))).toBe(true);
  });

  it('la misma lista en facetas distintas NO es la misma audiencia', () => {
    // "los del area de Logistica" y "los de la regional de Neiva" pueden dar la misma gente hoy
    // y gente distinta manana: lo que se compara es la regla, nunca su resultado.
    expect(sameAudienceRule(rule({ areaIds: [AREA_LOGISTICA] }), rule({ regionalIds: [AREA_LOGISTICA] }))).toBe(false);
  });

  it('exigirla a un cargo desde la ficha reutiliza la audiencia de la matriz', () => {
    const desdeLaMatriz = rule({ jobTitleIds: [CARGO_CONDUCTOR] });
    const desdeLaFicha = rule({ match: 'ALL', jobTitleIds: [CARGO_CONDUCTOR] });
    expect(sameAudienceRule(desdeLaMatriz, desdeLaFicha)).toBe(true);
    expect(singleJobTitleOf(desdeLaFicha)).toBe(CARGO_CONDUCTOR);
  });

  it('cruzar (ALL) y sumar (ANY) los mismos criterios son audiencias distintas', () => {
    const cruzando = rule({ match: 'ALL', jobTitleIds: [CARGO_CONDUCTOR], regionalIds: [REGIONAL_NEIVA] });
    const sumando = rule({ match: 'ANY', jobTitleIds: [CARGO_CONDUCTOR], regionalIds: [REGIONAL_NEIVA] });
    expect(sameAudienceRule(cruzando, sumando)).toBe(false);
  });
});
