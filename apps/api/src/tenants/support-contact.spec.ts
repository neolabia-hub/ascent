import { resolverContactoDeAyuda } from './support-contact.js';

const PLATAFORMA = { name: 'Soporte NEO PULSE', email: 'soporte@neopulse.co', phone: '', note: '' };

describe('resolverContactoDeAyuda', () => {
  it('el contacto de la empresa manda sobre el de la plataforma', () => {
    const contacto = resolverContactoDeAyuda(
      { support: { contactName: 'Coordinacion de SST', contactEmail: 'sst@transprensa.com' } },
      PLATAFORMA,
    );

    expect(contacto).toMatchObject({ scope: 'tenant', contactName: 'Coordinacion de SST' });
  });

  it('un solo campo basta para considerarlo configurado', () => {
    // Una empresa que solo publica una extension no puede caer al respaldo sin enterarse: veria
    // salir un contacto ajeno en su propia pantalla de ingreso.
    const contacto = resolverContactoDeAyuda({ support: { contactPhone: 'ext. 120' } }, PLATAFORMA);

    expect(contacto?.scope).toBe('tenant');
    expect(contacto?.contactPhone).toBe('ext. 120');
  });

  it('sin contacto propio cae al de la plataforma', () => {
    const contacto = resolverContactoDeAyuda({}, PLATAFORMA);

    expect(contacto).toEqual({
      contactName: 'Soporte NEO PULSE',
      contactEmail: 'soporte@neopulse.co',
      contactPhone: '',
      note: '',
      scope: 'platform',
    });
  });

  it('devuelve null cuando no hay ninguno de los dos', () => {
    // La pantalla no debe ensenar una tarjeta de contacto vacia: queda solo el boton de avisar.
    expect(resolverContactoDeAyuda({}, {})).toBeNull();
  });

  it('no expone el resto de los ajustes de la empresa', () => {
    // Se publica SIN sesion: solo pueden salir los cuatro campos de contacto, nunca las reglas de
    // negocio que viven en el mismo JSON.
    const contacto = resolverContactoDeAyuda(
      { passingScoreDefault: 95, support: { contactEmail: 'sst@transprensa.com' } },
      PLATAFORMA,
    );

    expect(Object.keys(contacto ?? {}).sort()).toEqual([
      'contactEmail',
      'contactName',
      'contactPhone',
      'note',
      'scope',
    ]);
  });
});
