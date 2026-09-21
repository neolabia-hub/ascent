import {
  brechaDeAutoevaluacion,
  calcularNota,
  planificarEvaluaciones,
  problemasDeReparto,
  repartirFormularios,
  type FormularioDelCiclo,
  type PersonaAEvaluar,
} from './performance-scoring.js';
import { cuandoCierra, diasHastaElCierre, tocaRecordar } from './performance-reminder.js';

describe('calcularNota', () => {
  it('normaliza cada escala antes de promediar', () => {
    // 4 de 5 son 80; "cumple" son 100. Promediando los numeros crudos, el "cumple" (1) hundiria a
    // quien tiene cuatros — justo lo contrario de lo que significa.
    const nota = calcularNota([
      { escala: 'ONE_TO_FIVE', valor: 4, peso: 1 },
      { escala: 'YES_NO', valor: 1, peso: 1 },
    ]);

    expect(nota).toBe(90);
  });

  it('pondera: una competencia con peso 3 arrastra el triple', () => {
    const nota = calcularNota([
      { escala: 'ONE_TO_FIVE', valor: 5, peso: 3 },
      { escala: 'ONE_TO_FIVE', valor: 1, peso: 1 },
    ]);

    // (100*3 + 20*1) / 4 = 80
    expect(nota).toBe(80);
  });

  it('lo que no se respondio no cuenta como cero', () => {
    // Un cero es una calificacion pesima; no contestar es no contestar.
    const nota = calcularNota([
      { escala: 'ONE_TO_FIVE', valor: 5, peso: 1 },
      { escala: 'ONE_TO_FIVE', valor: null, peso: 1 },
    ]);

    expect(nota).toBe(100);
  });

  it('un formulario de solo texto no tiene nota, y eso no es un cero', () => {
    expect(calcularNota([{ escala: 'TEXT_ONLY', valor: null, peso: 1 }])).toBeNull();
    expect(calcularNota([])).toBeNull();
  });

  it('la escala de diez se normaliza igual que la de cinco', () => {
    expect(calcularNota([{ escala: 'ONE_TO_TEN', valor: 7, peso: 1 }])).toBe(70);
  });
});

describe('planificarEvaluaciones', () => {
  const LOGISTICA = 'area-1';
  const JEFE = 'jefe-1';

  const FORMULARIO = 'cf-1';

  function persona(userId: string, areaId: string | null = LOGISTICA): PersonaAEvaluar {
    return { userId, areaId, jobTitleId: 'cargo-1', cycleFormId: FORMULARIO };
  }

  const responsables = new Map([[LOGISTICA, JEFE]]);

  it('genera la del jefe y la autoevaluacion cuando el ciclo la pide', () => {
    const { evaluaciones, sinEvaluador } = planificarEvaluaciones([persona('u1')], responsables, {
      autoevaluacion: true,
    });

    expect(sinEvaluador).toHaveLength(0);
    expect(evaluaciones).toEqual([
      { subjectUserId: 'u1', evaluatorUserId: 'u1', reviewerRole: 'SELF', cycleFormId: FORMULARIO },
      { subjectUserId: 'u1', evaluatorUserId: JEFE, reviewerRole: 'MANAGER', cycleFormId: FORMULARIO },
    ]);
  });

  it('sin autoevaluacion solo queda la del jefe', () => {
    const { evaluaciones } = planificarEvaluaciones([persona('u1')], responsables, {
      autoevaluacion: false,
    });

    expect(evaluaciones).toHaveLength(1);
    expect(evaluaciones[0]?.reviewerRole).toBe('MANAGER');
  });

  it('quien no tiene jefe se reporta, no se le inventa uno', () => {
    // Abrir un ciclo con evaluaciones asignadas a quien no corresponde se descubre cuando alguien
    // recibe una que no le toca. Un aviso se ve antes.
    const { evaluaciones, sinEvaluador } = planificarEvaluaciones(
      [persona('u1', 'area-sin-responsable'), persona('u2', null)],
      responsables,
      { autoevaluacion: false },
    );

    expect(evaluaciones).toHaveLength(0);
    expect(sinEvaluador).toEqual([
      { userId: 'u1', motivo: 'SIN_RESPONSABLE' },
      { userId: 'u2', motivo: 'SIN_AREA' },
    ]);
  });

  it('quien dirige el area no se califica a si misma como si fuera su jefe', () => {
    const { evaluaciones, sinEvaluador } = planificarEvaluaciones([persona(JEFE)], responsables, {
      autoevaluacion: true,
    });

    // La autoevaluacion si se genera: es de la persona sobre si misma y no depende de nadie.
    expect(evaluaciones).toEqual([
      { subjectUserId: JEFE, evaluatorUserId: JEFE, reviewerRole: 'SELF', cycleFormId: FORMULARIO },
    ]);
    expect(sinEvaluador).toEqual([{ userId: JEFE, motivo: 'ES_SU_PROPIO_JEFE' }]);
  });
});

describe('repartirFormularios', () => {
  const CONDUCTOR = 'cargo-conductor';
  const ANALISTA = 'cargo-analista';

  const conductores: FormularioDelCiclo = {
    cycleFormId: 'cf-conductores',
    jobTitleIds: [CONDUCTOR],
  };
  const analistas: FormularioDelCiclo = {
    cycleFormId: 'cf-analistas',
    jobTitleIds: [ANALISTA],
  };
  const general: FormularioDelCiclo = { cycleFormId: 'cf-general', jobTitleIds: [] };

  it('cada quien responde el formulario de su cargo, en la MISMA campaña', () => {
    // Es la razon de ser de la Decision #139: antes, esto eran dos ciclos y dos consolidados.
    const { asignaciones, sinFormulario } = repartirFormularios(
      [
        { userId: 'u1', jobTitleId: CONDUCTOR },
        { userId: 'u2', jobTitleId: ANALISTA },
      ],
      [conductores, analistas],
    );

    expect(sinFormulario).toHaveLength(0);
    expect(asignaciones.get('u1')).toBe('cf-conductores');
    expect(asignaciones.get('u2')).toBe('cf-analistas');
  });

  it('el formulario sin cargos recoge a quien no encaja en ninguno', () => {
    const { asignaciones, sinFormulario } = repartirFormularios(
      [
        { userId: 'u1', jobTitleId: CONDUCTOR },
        { userId: 'u2', jobTitleId: 'cargo-que-nadie-reclama' },
        { userId: 'u3', jobTitleId: null },
      ],
      [conductores, general],
    );

    expect(sinFormulario).toHaveLength(0);
    expect(asignaciones.get('u1')).toBe('cf-conductores');
    expect(asignaciones.get('u2')).toBe('cf-general');
    expect(asignaciones.get('u3')).toBe('cf-general');
  });

  it('sin general, quien no encaja se reporta y no se le coloca en cualquiera', () => {
    // Preguntarle a un conductor por competencias de analista se descubre cuando ya lo respondio.
    const { asignaciones, sinFormulario } = repartirFormularios(
      [
        { userId: 'u1', jobTitleId: CONDUCTOR },
        { userId: 'u2', jobTitleId: 'cargo-que-nadie-reclama' },
        { userId: 'u3', jobTitleId: null },
      ],
      [conductores],
    );

    expect(asignaciones.size).toBe(1);
    expect(sinFormulario).toEqual([
      { userId: 'u2', motivo: 'CARGO_SIN_FORMULARIO' },
      { userId: 'u3', motivo: 'SIN_CARGO' },
    ]);
  });

  it('un solo formulario general se comporta como antes: toda la empresa', () => {
    const { asignaciones, sinFormulario } = repartirFormularios(
      [
        { userId: 'u1', jobTitleId: CONDUCTOR },
        { userId: 'u2', jobTitleId: null },
      ],
      [general],
    );

    expect(sinFormulario).toHaveLength(0);
    expect([...asignaciones.values()]).toEqual(['cf-general', 'cf-general']);
  });
});

describe('problemasDeReparto', () => {
  it('dos formularios peleandose el mismo cargo es un ciclo que no se puede abrir', () => {
    // A quien le toca cual lo decidiria el orden de la consulta. Eso no se resuelve eligiendo uno.
    const problemas = problemasDeReparto([
      { cycleFormId: 'cf-1', jobTitleIds: ['cargo-conductor', 'cargo-auxiliar'] },
      { cycleFormId: 'cf-2', jobTitleIds: ['cargo-conductor'] },
    ]);

    expect(problemas.cargosSolapados).toEqual(['cargo-conductor']);
    expect(problemas.generales).toBe(0);
  });

  it('dos generales en la misma campaña tambien son ambiguos', () => {
    const problemas = problemasDeReparto([
      { cycleFormId: 'cf-1', jobTitleIds: [] },
      { cycleFormId: 'cf-2', jobTitleIds: [] },
    ]);

    expect(problemas.generales).toBe(2);
  });

  it('el reparto normal no tiene problemas', () => {
    const problemas = problemasDeReparto([
      { cycleFormId: 'cf-1', jobTitleIds: ['cargo-conductor'] },
      { cycleFormId: 'cf-2', jobTitleIds: [] },
    ]);

    expect(problemas.cargosSolapados).toHaveLength(0);
    expect(problemas.generales).toBe(1);
  });
});

describe('el recordatorio del ciclo', () => {
  const cierre = new Date('2026-12-31T23:59:59Z');

  it('avisa dentro de la ventana de los tres dias', () => {
    expect(tocaRecordar(cierre, new Date('2026-12-29T09:00:00Z'))).toBe(true);
    expect(tocaRecordar(cierre, new Date('2026-12-31T09:00:00Z'))).toBe(true);
  });

  it('no avisa cuando todavia falta mucho', () => {
    expect(tocaRecordar(cierre, new Date('2026-12-20T09:00:00Z'))).toBe(false);
  });

  it('no avisa cuando el ciclo ya cerro', () => {
    // Decirle a alguien que corra por algo que ya vencio solo confirma que el sistema no se entera.
    expect(tocaRecordar(cierre, new Date('2027-01-02T09:00:00Z'))).toBe(false);
  });

  it('cuenta por FECHA y no por horas', () => {
    // A las 9 de la noche del dia 30, para un cierre del 31, falta 1 dia — no 0.
    expect(diasHastaElCierre(cierre, new Date('2026-12-30T21:00:00Z'))).toBe(1);
  });

  it('mañana y hoy no se dicen con un numero', () => {
    expect(cuandoCierra(0)).toBe('cierra hoy');
    expect(cuandoCierra(1)).toBe('cierra mañana');
    expect(cuandoCierra(3)).toBe('cierra en 3 dias');
  });
});

/*
  LA BRECHA AUTOEVALUACION / JEFE (2026-09-21). Los datos ya existian —dos filas por persona— y
  nadie los cruzaba. Lo que se vigila aqui es que no se invente una diferencia donde falta una de
  las dos notas: rellenar con cero diria que coinciden, que es lo contrario de lo que pasa.
*/
describe('brecha entre la autoevaluacion y la del jefe', () => {
  const fila = (parcial: Partial<Parameters<typeof brechaDeAutoevaluacion>[0][number]>) => ({
    subjectUserId: 'u1',
    subjectName: 'Persona',
    reviewerRole: 'MANAGER',
    status: 'SUBMITTED',
    score: 80,
    ...parcial,
  });

  it('cruza las dos notas de la misma persona', () => {
    const resultado = brechaDeAutoevaluacion([
      fila({ reviewerRole: 'SELF', score: 90 }),
      fila({ reviewerRole: 'MANAGER', score: 70 }),
    ]);
    expect(resultado).toHaveLength(1);
    expect(resultado[0]).toMatchObject({ auto: 90, jefe: 70, diferencia: 20 });
  });

  it('la diferencia es negativa cuando la persona se infravalora', () => {
    const resultado = brechaDeAutoevaluacion([
      fila({ reviewerRole: 'SELF', score: 60 }),
      fila({ reviewerRole: 'MANAGER', score: 85 }),
    ]);
    expect(resultado[0]?.diferencia).toBe(-25);
  });

  it('con una sola de las dos NO aparece: la diferencia no existe', () => {
    expect(brechaDeAutoevaluacion([fila({ reviewerRole: 'SELF', score: 90 })])).toEqual([]);
    expect(brechaDeAutoevaluacion([fila({ reviewerRole: 'MANAGER', score: 90 })])).toEqual([]);
  });

  it('una sin entregar tampoco cuenta, aunque traiga nota', () => {
    const resultado = brechaDeAutoevaluacion([
      fila({ reviewerRole: 'SELF', score: 90 }),
      fila({ reviewerRole: 'MANAGER', score: 70, status: 'PENDING' }),
    ]);
    expect(resultado).toEqual([]);
  });

  it('ordena por la diferencia mas grande, en cualquiera de los dos sentidos', () => {
    const resultado = brechaDeAutoevaluacion([
      fila({ subjectUserId: 'a', reviewerRole: 'SELF', score: 82 }),
      fila({ subjectUserId: 'a', reviewerRole: 'MANAGER', score: 80 }),
      fila({ subjectUserId: 'b', reviewerRole: 'SELF', score: 50 }),
      fila({ subjectUserId: 'b', reviewerRole: 'MANAGER', score: 90 }),
    ]);
    expect(resultado.map((f) => f.subjectUserId)).toEqual(['b', 'a']);
  });
});
