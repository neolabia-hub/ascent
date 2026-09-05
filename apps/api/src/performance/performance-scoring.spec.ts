import {
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

  it('cada quien responde el formulario de su cargo, en la MISMA campana', () => {
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

  it('dos generales en la misma campana tambien son ambiguos', () => {
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

  it('manana y hoy no se dicen con un numero', () => {
    expect(cuandoCierra(0)).toBe('cierra hoy');
    expect(cuandoCierra(1)).toBe('cierra manana');
    expect(cuandoCierra(3)).toBe('cierra en 3 dias');
  });
});
