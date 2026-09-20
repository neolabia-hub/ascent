import { obligacionesQueCierra } from './close-assignments.js';

describe('obligacionesQueCierra', () => {
  it('sin nada vivo, no cierra nada', () => {
    expect(obligacionesQueCierra([])).toEqual([]);
  });

  it('una sola obligacion: la cierra', () => {
    expect(obligacionesQueCierra([{ id: 'a', ruleId: 'regla-1' }])).toEqual(['a']);
  });

  it('DOS REGLAS distintas sobre la misma formacion: cierra las dos', () => {
    // El caso que destapo el fallo: la formacion exigida desde su ficha Y desde un programa del
    // que es modulo. Es una sola cosa pedida por dos sitios, y hacerla una vez cumple las dos.
    const cerradas = obligacionesQueCierra([
      { id: 'de-la-ficha', ruleId: 'regla-ficha' },
      { id: 'del-programa', ruleId: 'regla-programa' },
    ]);
    expect(cerradas.sort()).toEqual(['de-la-ficha', 'del-programa']);
  });

  it('ACUMULA: dos rondas de la MISMA regla cierran solo la mas antigua', () => {
    // "Nace la nueva y sigue debiendo la anterior": son dos periodos, no una duplicidad. Hacerla
    // una vez paga UNA ronda. La lista llega ordenada de mas antigua a mas reciente.
    expect(
      obligacionesQueCierra([
        { id: 'ronda-2026', ruleId: 'reinduccion' },
        { id: 'ronda-2027', ruleId: 'reinduccion' },
      ]),
    ).toEqual(['ronda-2026']);
  });

  it('ACUMULA de tres años: sigue cerrando una sola', () => {
    expect(
      obligacionesQueCierra([
        { id: 'ronda-2025', ruleId: 'reinduccion' },
        { id: 'ronda-2026', ruleId: 'reinduccion' },
        { id: 'ronda-2027', ruleId: 'reinduccion' },
      ]),
    ).toEqual(['ronda-2025']);
  });

  it('las dos cosas a la vez: una por regla, la mas antigua de cada una', () => {
    expect(
      obligacionesQueCierra([
        { id: 'reind-2026', ruleId: 'reinduccion' },
        { id: 'prog-r1', ruleId: 'programa' },
        { id: 'reind-2027', ruleId: 'reinduccion' },
        { id: 'prog-r2', ruleId: 'programa' },
      ]),
    ).toEqual(['reind-2026', 'prog-r1']);
  });

  it('las puestas A MANO forman un grupo entre ellas: tambien se paga una por vez', () => {
    expect(
      obligacionesQueCierra([
        { id: 'manual-vieja', ruleId: null },
        { id: 'manual-nueva', ruleId: null },
      ]),
    ).toEqual(['manual-vieja']);
  });

  it('una a mano y una por regla son cosas distintas: cierra las dos', () => {
    const cerradas = obligacionesQueCierra([
      { id: 'a-mano', ruleId: null },
      { id: 'por-regla', ruleId: 'regla-1' },
    ]);
    expect(cerradas.sort()).toEqual(['a-mano', 'por-regla']);
  });
});
