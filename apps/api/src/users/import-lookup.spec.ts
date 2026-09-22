import { clave, indexar, mensajeDeColumna } from './user-import.service.js';

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

/**
 * EL MOTIVO QUE LEE QUIEN CORRIGE EL ARCHIVO (2026-09-21).
 *
 * El informe del lote enseñaba el mensaje crudo de Zod —*«Columna "area": String must contain at
 * least 2 character(s)»*— y el cliente lo reporto con 1.089 filas diciendo exactamente eso. Estas
 * pruebas fijan las tres cosas que estaban mal, porque un texto sin prueba vuelve al ingles en
 * cuanto alguien toque la validacion:
 *
 *   1. en español,
 *   2. que diga que la celda esta VACIA y no que es "demasiado corta",
 *   3. y que diga QUE hacer cuando hay algo que hacer.
 */
describe('el motivo de una fila rechazada', () => {
  const vacia = { documento: '1116267708', nombre_completo: 'Persona', area: '', correo: '' };

  it('el area vacia se dice en español y como lo que es: que falta', () => {
    const texto = mensajeDeColumna('area', { code: 'too_small' }, vacia);
    expect(texto).toContain('Falta "Área"');
    expect(texto).not.toMatch(/String|character|must contain/i);
  });

  it('y aprovecha para recordar la sub-area, que es donde el cliente se atasca', () => {
    expect(mensajeDeColumna('area', { code: 'too_small' }, vacia)).toContain('sub_area');
  });

  it('un correo vacio ya no es error: solo se avisa del que esta MAL escrito', () => {
    const texto = mensajeDeColumna('correo', { code: 'invalid_string' }, vacia);
    expect(texto).toContain('mal escrito');
    expect(texto).toContain('deja la celda vacía');
  });

  it('un correo con texto pero sin forma de correo dice QUE le falta, y lo enseña', () => {
    const texto = mensajeDeColumna('correo', { code: 'invalid_string' }, { ...vacia, correo: 'juan.perez' });
    expect(texto).toContain('juan.perez');
    expect(texto).toContain('arroba');
  });

  it('el cargo vacio nombra la salida: escribir tambien el tipo_cargo', () => {
    expect(mensajeDeColumna('cargo', { code: 'too_small' }, { ...vacia, cargo: '' })).toContain('tipo_cargo');
  });

  it('y ninguna columna se queda sin rotulo legible: nunca se enseña el nombre tecnico a secas', () => {
    for (const columna of ['documento', 'nombre_completo', 'telefono', 'sub_area', 'fecha_ingreso']) {
      const texto = mensajeDeColumna(columna, { code: 'too_small' }, { ...vacia, [columna]: '' });
      expect(texto).not.toContain(`"${columna}"`);
    }
  });
});
