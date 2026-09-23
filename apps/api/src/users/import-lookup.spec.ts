import { IMPORT_HEADERS, importRowSchema } from '@neo-pulse/shared';
import { clave, indexar, mensajeDeColumna, normalizarFecha } from './user-import.service.js';

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

  /*
    SE RECORREN TODAS LAS COLUMNAS DE VERDAD, no una lista escrita a mano (2026-09-22).

    Esta prueba existia con cinco columnas sueltas, y por eso no cazo que a `fecha_nacimiento` y a
    `vinculacion` les faltara el rotulo: **no estaban en la lista**. El cliente vio el resultado en
    produccion —«"fecha_nacimiento" no tiene un formato valido»—, con guion bajo y todo. Leyendo
    `IMPORT_HEADERS`, una columna nueva sin rotulo rompe la prueba el dia que se agrega.
  */
  it('y ninguna columna se queda sin rotulo legible: nunca se enseña el nombre tecnico a secas', () => {
    for (const columna of IMPORT_HEADERS) {
      const texto = mensajeDeColumna(columna, { code: 'invalid_string' }, { ...vacia, [columna]: 'lo que sea' });
      expect(texto).not.toContain(`"${columna}"`);
    }
  });
});

/**
 * LAS FECHAS QUE ESCRIBE EXCEL (2026-09-22).
 *
 * El cliente subio 1089 personas y le salio *«"fecha_nacimiento" no tiene un formato valido: "Tue
 * Jan 06 1998 00:00:00 GMT+0000"»*. Nadie escribio ese texto: lo fabricaba el propio sistema al
 * leer una celda con formato de fecha. Y debajo habia un segundo fallo, mas tonto y mas grave: la
 * expresion decia `d{4}` en vez de `\d{4}`, asi que **ninguna fecha de nacimiento habria pasado
 * jamas**, ni la mejor escrita.
 */
describe('fechas de la carga masiva', () => {
  it('lo que pide la plantilla pasa tal cual', () => {
    expect(normalizarFecha('2026-09-01')).toBe('2026-09-01');
    expect(normalizarFecha('')).toBe('');
  });

  it('acepta el dia/mes/año que teclea y exporta un Excel en español', () => {
    expect(normalizarFecha('06/01/1998')).toBe('1998-01-06');
    expect(normalizarFecha('6/1/1998')).toBe('1998-01-06');
    expect(normalizarFecha('31-12-2025')).toBe('2025-12-31');
  });

  it('si un numero pasa de 12 solo puede ser el dia, y eso decide la pareja sin adivinar', () => {
    expect(normalizarFecha('01/25/1998')).toBe('1998-01-25');
    expect(normalizarFecha('25/01/1998')).toBe('1998-01-25');
  });

  it('el mismo orden de la plantilla con otro separador tambien entra', () => {
    expect(normalizarFecha('2026/09/01')).toBe('2026-09-01');
  });

  it('lo que no es una fecha se devuelve igual, para que la fila falle diciendolo', () => {
    // Inventarse una fecha es peor que rechazar la fila: quedaria mal en el expediente y en silencio.
    expect(normalizarFecha('31/02/2026')).toBe('31/02/2026');
    expect(normalizarFecha('ayer')).toBe('ayer');
    expect(normalizarFecha('13/13/2026')).toBe('13/13/2026');
  });

  it('y el esquema ya no rechaza una fecha de nacimiento perfecta', () => {
    const base = {
      documento: '1107514183',
      nombre_completo: 'Persona de prueba',
      cargo: 'CONDUCTOR',
      area: 'LOGISTICA',
    };
    expect(importRowSchema.safeParse({ ...base, fecha_nacimiento: '1998-01-06' }).success).toBe(true);
    expect(importRowSchema.safeParse({ ...base, fecha_nacimiento: 'dddd-dd-dd' }).success).toBe(false);
  });

  it('un cargo con el nombre largo de verdad cabe: el archivo mide lo mismo que el catalogo', () => {
    const base = { documento: '1107514183', nombre_completo: 'Persona de prueba', area: 'LOGISTICA' };
    expect(importRowSchema.safeParse({ ...base, cargo: 'JEFE DE SEGURIDAD Y SALUD EN EL TRABAJO' }).success).toBe(true);
    // El tope sigue existiendo, y es el mismo del catalogo: 120.
    expect(importRowSchema.safeParse({ ...base, cargo: 'X'.repeat(121) }).success).toBe(false);
  });
});
