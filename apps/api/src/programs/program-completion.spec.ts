import { cicloDePrograma, evaluarPrograma, moduloAprobado, moduloPendiente, type EstadoModulo } from './program-completion.js';

function modulo(parcial: Partial<EstadoModulo> & { itemId: string }): EstadoModulo {
  // `pendiente: false` por defecto: la mayoria de estas pruebas son de la REGLA DEL CUPO, y ahi lo
  // que se mide es aprobado/no aprobado. Lo pendiente tiene su propio bloque mas abajo.
  return { isRequired: true, sectionName: null, aprobado: false, pendiente: false, ...parcial };
}

describe('evaluarPrograma', () => {
  it('todos obligatorios y todos aprobados: completo', () => {
    const r = evaluarPrograma(
      [modulo({ itemId: 'a', aprobado: true }), modulo({ itemId: 'b', aprobado: true })],
      {},
    );
    expect(r.completo).toBe(true);
    expect(r.obligatoriosPendientes).toEqual([]);
  });

  it('un obligatorio sin aprobar bloquea el programa aunque los demas esten aprobados', () => {
    const r = evaluarPrograma(
      [modulo({ itemId: 'a', aprobado: true }), modulo({ itemId: 'b', aprobado: false })],
      {},
    );
    expect(r.completo).toBe(false);
    expect(r.obligatoriosPendientes).toEqual(['b']);
  });

  /**
   * EL EJEMPLO EXACTO DEL CLIENTE: 8 modulos, "Gestion Humana" siempre obligatorio, y de los otros
   * 7 hace falta aprobar 6 — no importa cuales de los 7, con tal de que sean 6.
   */
  it('el caso real: un obligatorio + cupo de 6 sobre 7 opcionales', () => {
    const opcionales = ['comercial', 'logistica', 'operaciones', 'finanzas', 'ti', 'ventas', 'compras'];
    const base: EstadoModulo[] = [
      modulo({ itemId: 'gestion-humana', isRequired: true, aprobado: true }),
      ...opcionales.map((id, i) => modulo({ itemId: id, isRequired: false, sectionName: 'opcionales', aprobado: i < 6 })),
    ];

    const r = evaluarPrograma(base, { opcionales: 6 });
    expect(r.completo).toBe(true);
    expect(r.secciones.opcionales).toMatchObject({ aprobados: 6, total: 7, minimo: 6, completa: true });
  });

  it('el mismo caso, pero solo 5 opcionales aprobados: NO completa, aunque el obligatorio si', () => {
    const opcionales = ['comercial', 'logistica', 'operaciones', 'finanzas', 'ti', 'ventas', 'compras'];
    const base: EstadoModulo[] = [
      modulo({ itemId: 'gestion-humana', isRequired: true, aprobado: true }),
      ...opcionales.map((id, i) => modulo({ itemId: id, isRequired: false, sectionName: 'opcionales', aprobado: i < 5 })),
    ];

    const r = evaluarPrograma(base, { opcionales: 6 });
    expect(r.completo).toBe(false);
    expect(r.secciones.opcionales?.completa).toBe(false);
  });

  it('gestion humana aprobada NO compensa que falten opcionales: las dos condiciones son independientes', () => {
    const r = evaluarPrograma(
      [
        modulo({ itemId: 'gh', isRequired: true, aprobado: true }),
        modulo({ itemId: 'a', isRequired: false, sectionName: 's', aprobado: false }),
        modulo({ itemId: 'b', isRequired: false, sectionName: 's', aprobado: false }),
      ],
      { s: 1 },
    );
    expect(r.completo).toBe(false);
  });

  it('un modulo sin seccion se trata como obligatorio, aunque isRequired venga en false', () => {
    // Defensivo: si alguien arma un modulo "opcional" pero olvida darle seccion, no debe colarse
    // silenciosamente como si no hiciera falta aprobarlo nunca.
    const r = evaluarPrograma([modulo({ itemId: 'suelto', isRequired: false, sectionName: null, aprobado: false })], {});
    expect(r.completo).toBe(false);
    expect(r.obligatoriosPendientes).toEqual(['suelto']);
  });

  it('dos secciones de cupo independientes: las dos tienen que llegar a su minimo', () => {
    const r = evaluarPrograma(
      [
        modulo({ itemId: 'a1', isRequired: false, sectionName: 'A', aprobado: true }),
        modulo({ itemId: 'a2', isRequired: false, sectionName: 'A', aprobado: false }),
        modulo({ itemId: 'b1', isRequired: false, sectionName: 'B', aprobado: true }),
        modulo({ itemId: 'b2', isRequired: false, sectionName: 'B', aprobado: true }),
      ],
      { A: 2, B: 2 },
    );
    expect(r.completo).toBe(false); // A solo tiene 1 de 2
    expect(r.secciones.A?.completa).toBe(false);
    expect(r.secciones.B?.completa).toBe(true);
  });

  it('un programa sin modulos completa trivialmente (nada que aprobar)', () => {
    expect(evaluarPrograma([], {}).completo).toBe(true);
  });

  it('una seccion sin minimo declarado se da por completa: el cupo es 0', () => {
    // `validarSecciones` impide guardar esto, pero si una fila vieja llega sin minimo la regla no
    // puede bloquear el programa para siempre por un dato que nadie puede corregir desde la pantalla.
    const r = evaluarPrograma([modulo({ itemId: 'a', isRequired: false, sectionName: 'S', aprobado: false })], {});
    expect(r.secciones.S).toMatchObject({ aprobados: 0, total: 1, minimo: 0, completa: true });
    expect(r.completo).toBe(true);
  });

  it('un minimo mayor que los modulos de la seccion no se puede cumplir nunca', () => {
    // No es un caso que la pantalla deje armar, pero si llega, la respuesta correcta es "no completa"
    // y no un completo silencioso.
    const r = evaluarPrograma(
      [
        modulo({ itemId: 'a', isRequired: false, sectionName: 'S', aprobado: true }),
        modulo({ itemId: 'b', isRequired: false, sectionName: 'S', aprobado: true }),
      ],
      { S: 3 },
    );
    expect(r.completo).toBe(false);
  });

  it('isRequired gana sobre la seccion: un obligatorio CON seccion no entra en el cupo', () => {
    // Si contara para el cupo, marcar un modulo como obligatorio lo haria mas facil de esquivar
    // (aportaria al pozo de los opcionales), que es justo lo contrario de lo que significa.
    const r = evaluarPrograma(
      [
        modulo({ itemId: 'gh', isRequired: true, sectionName: 'S', aprobado: false }),
        modulo({ itemId: 'a', isRequired: false, sectionName: 'S', aprobado: true }),
      ],
      { S: 1 },
    );
    expect(r.completo).toBe(false);
    expect(r.obligatoriosPendientes).toEqual(['gh']);
    expect(r.secciones.S).toMatchObject({ aprobados: 1, total: 1, completa: true });
  });

  it('todos los obligatorios pendientes se listan, no solo el primero', () => {
    const r = evaluarPrograma([modulo({ itemId: 'a' }), modulo({ itemId: 'b' }), modulo({ itemId: 'c', aprobado: true })], {});
    expect(r.obligatoriosPendientes).toEqual(['a', 'b']);
  });
});

/**
 * NADA SE PUEDE DEJAR SIN HACER. El cupo perdona haber PERDIDO un modulo, no haberlo IGNORADO:
 * *"si no hace 1 no puede aprobar aunque diga 6 de 7"*.
 */
describe('evaluarPrograma: modulos que siguen debiendose', () => {
  const opcionales = (aprobados: number, pendientes: number, total: number) =>
    Array.from({ length: total }, (_, i) =>
      modulo({
        itemId: `op${i}`,
        isRequired: false,
        sectionName: 'S',
        aprobado: i < aprobados,
        pendiente: i >= total - pendientes,
      }),
    );

  it('EL CASO DEL CLIENTE: 6 de 7 aprobados pero el septimo SIN TOCAR no completa', () => {
    // Antes esto daba `completo: true` — el cupo salia y nadie miraba que el septimo seguia abierto.
    const r = evaluarPrograma(opcionales(6, 1, 7), { S: 6 });
    expect(r.secciones.S?.completa).toBe(true);
    expect(r.sinResolver).toEqual(['op6']);
    expect(r.completo).toBe(false);
  });

  it('el mismo caso con el septimo RESUELTO (perdido o eximido): completa', () => {
    // Reprobarlo o que se lo eximan cierra su obligacion: ya no se le debe, y el cupo lo perdona.
    const r = evaluarPrograma(opcionales(6, 0, 7), { S: 6 });
    expect(r.sinResolver).toEqual([]);
    expect(r.completo).toBe(true);
  });

  it('EXIMIR DE MAS de lo que el cupo perdona no completa: eximir no es aprobar', () => {
    // 5 aprobados y 2 resueltos-sin-aprobar sobre un cupo de 6: faltan aprobaciones, no resoluciones.
    const r = evaluarPrograma(opcionales(5, 0, 7), { S: 6 });
    expect(r.sinResolver).toEqual([]);
    expect(r.secciones.S?.completa).toBe(false);
    expect(r.completo).toBe(false);
  });

  it('un OBLIGATORIO pendiente bloquea igual, y sale en las dos listas', () => {
    const r = evaluarPrograma([modulo({ itemId: 'gh', aprobado: false, pendiente: true })], {});
    expect(r.obligatoriosPendientes).toEqual(['gh']);
    expect(r.sinResolver).toEqual(['gh']);
    expect(r.completo).toBe(false);
  });

  it('SIN OBLIGACION no hay pendiente: quien curso por su cuenta completa con su cupo', () => {
    // A esta persona nadie le exigio el septimo, asi que no se le debe. Es el caso de un programa
    // sin asignacion propia, y exigirlo ahi seria inventarle una obligacion que nadie creo.
    const r = evaluarPrograma(opcionales(6, 0, 7), { S: 6 });
    expect(r.completo).toBe(true);
  });

  it('todos los pendientes se listan, obligatorios y de cupo juntos', () => {
    const r = evaluarPrograma(
      [
        modulo({ itemId: 'gh', pendiente: true }),
        modulo({ itemId: 'a', isRequired: false, sectionName: 'S', aprobado: true }),
        modulo({ itemId: 'b', isRequired: false, sectionName: 'S', pendiente: true }),
      ],
      { S: 1 },
    );
    expect(r.sinResolver.sort()).toEqual(['b', 'gh']);
  });
});

describe('moduloPendiente', () => {
  it('sin obligacion no se debe nada', () => {
    expect(moduloPendiente(null)).toBe(false);
    expect(moduloPendiente(undefined)).toBe(false);
  });

  it.each(['PENDING', 'IN_PROGRESS', 'OVERDUE'])('la obligacion %s sigue viva: pendiente', (status) => {
    expect(moduloPendiente({ cycleNumber: 1, status })).toBe(true);
  });

  it('cerrada como cumplida: resuelto', () => {
    expect(moduloPendiente({ cycleNumber: 1, status: 'COMPLETED' })).toBe(false);
  });

  it('EXIMIDA: resuelto — es la salida de quien no pudo presentarse', () => {
    expect(moduloPendiente({ cycleNumber: 1, status: 'WAIVED' })).toBe(false);
  });

  it('retirada por salir de la audiencia: resuelto, ya no le aplica', () => {
    expect(moduloPendiente({ cycleNumber: 1, status: 'WITHDRAWN_LEFT_AUDIENCE' })).toBe(false);
  });
});

/**
 * La regla que decide el visto verde de cada modulo. Importa doble: es la que hace que una
 * Reinduccion vuelva a pedirse (y emita una SEGUNDA constancia) en vez de quedarse completa para
 * siempre desde la primera vuelta.
 */
describe('moduloAprobado', () => {
  describe('modulos que el motor NUNCA alcanzo (sin obligacion)', () => {
    it('lo aprobo alguna vez: cuenta', () => {
      expect(moduloAprobado({ ronda: null, aprobadoAlgunaVez: true })).toBe(true);
    });

    it('nunca lo aprobo: no cuenta', () => {
      expect(moduloAprobado({ ronda: null, aprobadoAlgunaVez: false })).toBe(false);
    });

    it('`undefined` se trata igual que `null`: es lo que devuelve un Map sin la clave', () => {
      expect(moduloAprobado({ ronda: undefined, aprobadoAlgunaVez: true })).toBe(true);
    });
  });

  describe('modulos CON obligacion: manda la obligacion vigente, no el historial', () => {
    it('obligacion cerrada: aprobado', () => {
      expect(moduloAprobado({ ronda: { cycleNumber: 2, status: 'COMPLETED' }, aprobadoAlgunaVez: false })).toBe(true);
    });

    it('LA CLAVE DE 11.6: si se le abrio una ronda nueva, la vigente esta PENDIENTE y pierde el visto', () => {
      // Sin esto, una Reinduccion armada como programa se veria completa para siempre desde la
      // primera vuelta y jamas emitiria una segunda constancia. La ronda nueva es la mas reciente,
      // asi que es la que se mira — no hace falta compararla con la del programa.
      expect(moduloAprobado({ ronda: { cycleNumber: 2, status: 'PENDING' }, aprobadoAlgunaVez: true })).toBe(false);
    });

    it('EL HISTORIAL SE IGNORA cuando hay obligacion, aunque diga que si lo aprobo', () => {
      // `Enrollment` no distingue rondas: consultarlo aqui devolveria "aprobado" para siempre.
      expect(moduloAprobado({ ronda: { cycleNumber: 1, status: 'OVERDUE' }, aprobadoAlgunaVez: true })).toBe(false);
    });

    it('SU VENTANA NO SE HA ABIERTO: su ronda 1 cerrada sigue valiendo aunque OTRO modulo ya vaya por la 2', () => {
      // Es lo que promete `cicloDePrograma`: los modulos van cayendo en pendientes uno por uno,
      // segun se le abre la ventana a CADA UNO, no todos el mismo dia. La primera version comparaba
      // con la ronda del programa y tumbaba los ocho modulos de una reinduccion a la vez, dejando al
      // aprendiz siete formaciones "pendientes" que ni siquiera podia hacer.
      expect(moduloAprobado({ ronda: { cycleNumber: 1, status: 'COMPLETED' }, aprobadoAlgunaVez: false })).toBe(true);
    });

    it('obligacion abierta: todavia no', () => {
      expect(moduloAprobado({ ronda: { cycleNumber: 1, status: 'PENDING' }, aprobadoAlgunaVez: false })).toBe(false);
    });

    it('obligacion vencida: no aprobado', () => {
      expect(moduloAprobado({ ronda: { cycleNumber: 1, status: 'OVERDUE' }, aprobadoAlgunaVez: false })).toBe(false);
    });

    it('eximida NO es aprobada: el cupo del programa se cumple haciendo, no perdonando', () => {
      expect(moduloAprobado({ ronda: { cycleNumber: 1, status: 'WAIVED' }, aprobadoAlgunaVez: false })).toBe(false);
    });

    it('retirada por salir de la audiencia tampoco cuenta', () => {
      expect(moduloAprobado({ ronda: { cycleNumber: 1, status: 'WITHDRAWN_LEFT_AUDIENCE' }, aprobadoAlgunaVez: false })).toBe(false);
    });
  });
});

describe('cicloDePrograma', () => {
  it('sin modulos rastreados por el motor: se queda en la ronda que ya tenia la inscripcion', () => {
    expect(cicloDePrograma(1, [])).toBe(1);
  });

  it('todos los modulos siguen en la ronda 1: el programa tambien', () => {
    expect(cicloDePrograma(1, [1, 1, 1])).toBe(1);
  });

  it('un modulo (Reinduccion) ya abrio ronda 2: el programa entero pasa a ronda 2, aunque los demas sigan en la 1', () => {
    expect(cicloDePrograma(1, [1, 2, 1])).toBe(2);
  });

  it('nunca retrocede: una regla borrada o desactivada no hace caer al programa a una ronda anterior', () => {
    expect(cicloDePrograma(3, [1])).toBe(3);
  });

  it('toma la mas adelantada de todas, no la ultima de la lista', () => {
    expect(cicloDePrograma(1, [4, 2, 7, 3])).toBe(7);
  });
});
