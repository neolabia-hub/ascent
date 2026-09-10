import { LEARNER_ONLY_PERMISSIONS, PERMISSIONS, SEED_ROLE_PERMISSIONS } from '@neo-pulse/shared';

/**
 * LA COMPROBACION QUE FALTABA (2026-09-10).
 *
 * De «esta persona solo tiene lo suyo» cuelgan dos decisiones de la interfaz del aprendiz:
 * a donde entra al iniciar sesion, y si ve el conmutador de vuelta al panel de administracion.
 *
 * La lista que lo decidia tenia UN permiso, `enrollments:read_own`, y estaba en un archivo de la
 * web. Cuando el rol Usuario crecio a tres —le llegaron `performance:read_own` y `attendance:sign`—
 * nadie volvio a mirarla, porque no habia nada que obligara a mirarla. A partir de ese dia un
 * conductor iniciaba sesion y aterrizaba en el panel de administracion, con el conmutador puesto.
 *
 * No dio ningun error. Las dos cosas "funcionaban". Esto es lo que lo habria cazado el mismo dia.
 */
describe('quien solo tiene lo suyo', () => {
  const deLoSuyo = new Set<string>(LEARNER_ONLY_PERMISSIONS);

  /** El rol tiene que existir en la semilla: si desaparece, esto falla en vez de pasar de largo. */
  const permisosDe = (rol: string): readonly string[] => {
    const permisos = SEED_ROLE_PERMISSIONS[rol];
    if (!permisos) throw new Error(`SEED_ROLE_PERMISSIONS no define el rol "${rol}"`);
    return permisos;
  };

  it('el rol Usuario de la semilla es ENTERAMENTE de lo suyo', () => {
    /*
      ESTA ES LA PRUEBA QUE IMPORTA.

      Si algun dia el rol Usuario recibe un permiso que no sea «sobre lo mio», o bien ese permiso
      pertenece a la lista y hay que anadirlo en `permissions.ts`, o bien el rol Usuario ha dejado
      de ser solo aprendiz y hay que decidirlo a proposito. Las dos salidas son validas; lo que no
      vale es que pase sin que nadie lo note, que es exactamente lo que paso.
    */
    const intrusos = permisosDe('USUARIO').filter((permission) => !deLoSuyo.has(permission));

    expect(intrusos).toEqual([]);
  });

  it('todo permiso `:read_own` entra en la lista sin que haya que acordarse', () => {
    const propios = PERMISSIONS.filter((permission) => permission.endsWith(':read_own'));

    expect(propios.length).toBeGreaterThan(0);
    for (const permission of propios) {
      expect(deLoSuyo.has(permission)).toBe(true);
    }
  });

  it('ningun permiso de gestion se ha colado en la lista', () => {
    // La otra direccion, que es la peligrosa: un fallo aqui esconderia el panel a quien lo
    // administra, o peor, dejaria entrar a la superficie del aprendiz a quien deberia ver el panel.
    for (const permission of ['users:manage', 'catalog:publish', 'reports:read_all', 'attendance:take']) {
      expect(deLoSuyo.has(permission)).toBe(false);
    }
  });

  it('el Administrador y el Analista NO son solo aprendices', () => {
    for (const rol of ['ADMIN', 'ANALISTA'] as const) {
      const soloLoSuyo = permisosDe(rol).every((permission) => deLoSuyo.has(permission));
      expect(soloLoSuyo).toBe(false);
    }
  });
});
