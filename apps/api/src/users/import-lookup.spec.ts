import { clave, indexar } from './user-import.service.js';

/**
 * La carga masiva tiene que tragarse el Excel que el cliente ya tiene, no obligarle a fabricar
 * uno nuevo. Eso significa aceptar "Logística" donde el catalogo guarda "LOGISTICA".
 */
describe('busqueda de catalogos en la carga masiva', () => {
  const CATALOGO = [
    { id: 'log', code: 'LOGISTICA', name: 'Logistica' },
    { id: 'gh', code: 'GESTION_HUMANA', name: 'Gestion Humana' },
  ];

  it('quita tildes, espacios y mayusculas', () => {
    expect(clave('  Logística ')).toBe('LOGISTICA');
    expect(clave('gestión humana')).toBe('GESTION HUMANA');
  });

  it('encuentra por codigo', () => {
    expect(indexar(CATALOGO).get(clave('LOGISTICA'))).toBe('log');
  });

  it('encuentra por nombre, que es lo que trae el Excel del cliente', () => {
    expect(indexar(CATALOGO).get(clave('Logística'))).toBe('log');
    expect(indexar(CATALOGO).get(clave('Gestión Humana'))).toBe('gh');
  });

  it('no inventa: lo que no esta, no esta', () => {
    expect(indexar(CATALOGO).get(clave('Compras'))).toBeUndefined();
  });

  // Si alguien llama "LOGISTICA" a un area y otra se llama igual por nombre, gana el codigo:
  // es el identificador estable, el nombre es una etiqueta que se puede cambiar.
  it('el codigo manda sobre el nombre cuando chocan', () => {
    const choque = [
      { id: 'uno', code: 'LOGISTICA', name: 'Operaciones' },
      { id: 'dos', code: 'OPERACIONES', name: 'Logistica' },
    ];
    expect(indexar(choque).get(clave('LOGISTICA'))).toBe('uno');
  });
});
