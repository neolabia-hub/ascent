import { responsibleChangeAllowed, assertResponsibleChangeAllowed } from './responsible-rules.js';

const ANA = 'u-1';
const OTRO = 'u-2';

describe('responsibleChangeAllowed', () => {
  it('no tocarlo siempre vale: editar el nombre no puede fallar por el responsable', () => {
    expect(responsibleChangeAllowed({ current: ANA, requested: undefined, hasOpenDraft: false })).toBe(true);
  });

  it('mandar el mismo valor vale: el formulario reenvia la ficha entera, no solo lo que cambio', () => {
    expect(responsibleChangeAllowed({ current: ANA, requested: ANA, hasOpenDraft: false })).toBe(true);
  });

  it('con un borrador abierto se cambia: es el momento de decidir el contenido', () => {
    expect(responsibleChangeAllowed({ current: ANA, requested: OTRO, hasOpenDraft: true })).toBe(true);
  });

  it('sin borrador NO se cambia: reescribiria quien respondia por lo que ya se dicto', () => {
    expect(responsibleChangeAllowed({ current: ANA, requested: OTRO, hasOpenDraft: false })).toBe(false);
  });

  it('quitarlo tambien es cambiarlo', () => {
    expect(responsibleChangeAllowed({ current: ANA, requested: null, hasOpenDraft: false })).toBe(false);
  });

  it('ponerlo por primera vez sigue la misma regla', () => {
    expect(responsibleChangeAllowed({ current: null, requested: ANA, hasOpenDraft: false })).toBe(false);
    expect(responsibleChangeAllowed({ current: null, requested: ANA, hasOpenDraft: true })).toBe(true);
  });

  it('el rechazo explica la salida, no solo que no se puede', () => {
    try {
      assertResponsibleChangeAllowed({ current: ANA, requested: OTRO, hasOpenDraft: false });
      throw new Error('deberia haber lanzado');
    } catch (error) {
      const body = (error as { response?: { code?: string; message?: string } }).response;
      expect(body?.code).toBe('RESPONSIBLE_LOCKED');
      expect(body?.message).toContain('versión nueva');
    }
  });
});
