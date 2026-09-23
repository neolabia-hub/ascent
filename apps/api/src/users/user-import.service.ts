import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import ExcelJS from 'exceljs';
import { IMPORT_HEADERS, importRowSchema, type ImportRowInput } from '@neo-pulse/shared';
import { RequirementEngineService } from '../assignments/requirement-engine.service.js';
import { AuditService } from '../common/audit.service.js';
import type { AuthUser } from '../common/types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { generateInitialPassword } from './password.util.js';

/** La ficha que ya existe, para poder comparar campo a campo antes de escribir. */
export interface PersonaExistente {
  id: string;
  documentNumber: string;
  email: string | null;
  fullName: string;
  phone: string | null;
  jobTitleId: string;
  areaId: string;
  regionalId: string | null;
  serviceId: string | null;
  hiredAt: Date | null;
  employmentType: string;
  active: boolean;
}

interface RowResult {
  rowNumber: number;
  status: 'OK' | 'ERROR';
  documento: string;
  /** El nombre tal como venia en el archivo, para que el informe diga DE QUIEN es cada error. */
  nombre?: string | null;
  /** Que se hizo con esta fila. Sin esto, «180 filas OK» no dice si se creo o se actualizo gente. */
  accion?: 'CREADA' | 'ACTUALIZADA' | 'SIN_CAMBIOS';
  error?: string;
  /** No es un error: informa que un cargo/area/regional/servicio se creo solo, sobre la marcha. */
  note?: string;
  generatedPassword?: string;
  /** Id de la persona creada: enlaza la fila del lote y alimenta el motor de requisitos. */
  userId?: string;
}

export interface ImportResult {
  batchId: string;
  /** `true` = no se escribio nada: es la vista previa del 5.4. */
  simulacion?: boolean;
  total: number;
  ok: number;
  failed: number;
  /** Desglose del `ok`: cuantas nacieron, a cuantas se les cambio algo y cuantas ya estaban igual. */
  creadas: number;
  actualizadas: number;
  sinCambios: number;
  rows: RowResult[];
}

/**
 * Carga masiva de usuarios desde CSV o XLSX (negocio 3.3): plantilla con encabezados en
 * español, validacion POR FILA (las filas buenas entran aunque otras fallen), reporte de
 * errores fila a fila y contrasena inicial generada (cedula + caracteres) devuelta UNA vez
 * para que el admin la distribuya. Todo queda en user_import_batches/rows para auditoria.
 */
/**
 * Clave de busqueda tolerante: sin tildes, sin espacios de sobra y en mayusculas.
 *
 * El Excel del cliente dice "Logística" y el catalogo guarda el codigo "LOGISTICA": exigirle el
 * codigo obliga a explicar en la plantilla un concepto que no es suyo, y a que alguien traduzca
 * 300 filas a mano. Con esto valen las dos cosas y nadie tiene que aprender nada.
 */
export function clave(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toUpperCase();
}

/** Indice por CODIGO y por NOMBRE, para que el archivo pueda traer cualquiera de los dos. */
export function indexar(filas: Array<{ id: string; code: string; name: string }>): Map<string, string> {
  const indice = new Map<string, string>();
  for (const fila of filas) {
    indice.set(clave(fila.code), fila.id);
    // El codigo manda: si un nombre choca con el codigo de otro, no se pisa.
    if (!indice.has(clave(fila.name))) indice.set(clave(fila.name), fila.id);
  }
  return indice;
}

/**
 * EL CODIGO PARA UN CARGO/AREA/REGIONAL/SERVICIO QUE SE CREA SOLO, desde su nombre.
 *
 * En todo el resto del producto el codigo lo escribe la persona al crear el catalogo por la
 * interfaz (`catalogs.service.ts`): aqui no hay quien lo escriba, asi que se deriva del nombre.
 * `clave()` ya deja el nombre en mayusculas y sin tildes; solo falta que sea un codigo valido
 * —espacios y signos fuera— y que no choque con uno que ya exista.
 *
 * `usados` se pasa por fuera y se actualiza despues de crear, no aqui dentro: dos filas seguidas
 * pidiendo el mismo cargo nuevo tienen que dar el MISMO id, no dos cargos con codigos "X" y "X_2".
 * Ese reuso lo hace `ctx.jobTitleByCode` (y sus equivalentes), no este generador.
 */
export function codigoDesdeNombre(nombre: string, usados: ReadonlySet<string>): string {
  const base = clave(nombre).replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'CARGO';
  if (!usados.has(base)) return base;
  for (let sufijo = 2; sufijo < 1000; sufijo++) {
    const candidato = `${base}_${sufijo}`;
    if (!usados.has(candidato)) return candidato;
  }
  // Practicamente inalcanzable (1000 cargos con el mismo nombre base), pero un codigo unico
  // vale mas que un choque silencioso.
  return `${base}_${Date.now()}`;
}

/**
 * EL ID DE UN CATALOGO QUE **SE CREARIA**, en una simulacion (`PENDIENTES` 5.4).
 *
 * En vista previa no se crea el area ni el cargo que faltan, pero la fila sigue necesitando un id
 * para poder compararse con lo que la persona tiene hoy. Se usa este, que no existe en la base y por
 * tanto **nunca coincide** con el de nadie — que es justo la respuesta correcta: si el area todavia
 * no existe, esa persona no puede estar en ella, asi que es un cambio.
 *
 * Es reconocible a simple vista, a proposito: si alguna vez apareciera escrito en la base, el fallo
 * se ve en vez de esconderse detras de un UUID cualquiera.
 */
function idSimulado(codigo: string): string {
  return `SIMULADO:${codigo}`;
}

/** Como se llama cada columna cuando hay que nombrarla en un mensaje. */
const ROTULO: Record<string, string> = {
  documento: 'Documento',
  nombre_completo: 'Nombre completo',
  correo: 'Correo',
  telefono: 'Teléfono',
  cargo: 'Cargo',
  tipo_cargo: 'Tipo de cargo',
  area: 'Área',
  sub_area: 'Sub-área',
  regional: 'Regional',
  servicio: 'Servicio',
  fecha_ingreso: 'Fecha de ingreso',
  // Faltaban las dos, asi que el aviso salia con el nombre crudo de la columna —«"fecha_nacimiento"
  // no tiene un formato valido»—, con guion bajo y todo, que es justo la jerga que se queria evitar.
  fecha_nacimiento: 'Fecha de nacimiento',
  vinculacion: 'Vinculación',
};

/** Las dos columnas de fecha. Se nombran una vez: se normalizan igual y se explican igual. */
const COLUMNAS_DE_FECHA = ['fecha_ingreso', 'fecha_nacimiento'] as const;

/** `2026-09-01` a partir de una fecha, leida en UTC — que es como ExcelJS entrega las celdas. */
function comoISO(fecha: Date): string {
  const mes = String(fecha.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getUTCDate()).padStart(2, '0');
  return `${fecha.getUTCFullYear()}-${mes}-${dia}`;
}

/**
 * LA FECHA QUE ESCRIBE EXCEL, TRADUCIDA A LA QUE PIDE EL SISTEMA (2026-09-22).
 *
 * La pantalla dice «AAAA-MM-DD» y el archivo trae otra cosa, **sin que quien lo llenó haya hecho
 * nada mal**: en una celda con formato de fecha, Excel no guarda el texto que se escribió sino un
 * numero, y cada quien lo ve con el formato de su region. El cliente subio 1089 personas y le
 * salio *«"fecha_nacimiento" no tiene un formato valido: "Tue Jan 06 1998 00:00:00 GMT+0000"»* —
 * un texto que nadie escribio y que no se puede corregir en la celda, porque la celda se ve bien.
 *
 * Pedirle a una empresa que convierta 1089 celdas a texto plano no es una solucion: es trasladarle
 * un detalle de implementacion. Aqui se acepta lo que Excel produce de verdad:
 *
 *   - una celda con formato de fecha (llega ya como `Date`, ver `parseXlsx`);
 *   - `AAAA-MM-DD`, que es lo que pide la plantilla y sigue siendo lo recomendado;
 *   - `D/M/AAAA` y `D-M-AAAA`, que es como lo teclea y lo exporta un Excel en español.
 *
 * ─── DIA/MES Y NO MES/DIA, Y POR QUE SE PUEDE AFIRMAR ───
 *
 * `06/01/1998` es 6 de enero o 6 de junio segun quien lo mire, y el archivo no lo dice. Se resuelve
 * asi: si un numero pasa de 12 **solo puede ser el dia**, y eso decide la pareja sin adivinar. Si
 * los dos caben en un mes, se lee DIA/MES — la convencion de Colombia, que es donde esta el cliente,
 * y la del Excel con el que se arma el archivo.
 *
 * Lo que NO se hace es inventar: si no encaja en ninguna de esas formas, se devuelve el valor tal
 * cual y la fila falla diciendo que esa celda no es una fecha. Una fecha mal leida en silencio es
 * peor que una fila rechazada.
 */
export function normalizarFecha(valor: string): string {
  const limpio = valor.trim();
  if (limpio === '' || /^\d{4}-\d{2}-\d{2}$/.test(limpio)) return limpio;

  const partes = limpio.match(/^(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{1,4})$/);
  if (!partes) return limpio;
  const [, uno, dos, tres] = partes as unknown as [string, string, string, string];

  let anio: number;
  let mes: number;
  let dia: number;
  if (uno.length === 4) {
    // AAAA/MM/DD — el mismo orden de la plantilla, con otro separador.
    anio = Number(uno);
    mes = Number(dos);
    dia = Number(tres);
  } else if (tres.length === 4) {
    anio = Number(tres);
    const a = Number(uno);
    const b = Number(dos);
    // Un numero mayor que 12 no puede ser un mes: ese decide, y el otro es el mes.
    if (b > 12) {
      mes = a;
      dia = b;
    } else {
      dia = a;
      mes = b;
    }
  } else {
    return limpio;
  }

  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || anio < 1900 || anio > 2200) return limpio;
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  // Rebota los dias que no existen —31 de febrero— en vez de dejar que rueden al mes siguiente.
  if (fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) return limpio;
  return comoISO(fecha);
}

/**
 * EL MOTIVO, EN ESPAÑOL Y DICIENDO QUE HACER (2026-09-21).
 *
 * El informe del lote enseñaba el mensaje CRUDO de Zod: *«Columna "area": String must contain at
 * least 2 character(s)»*. Lo reporto el cliente con 1.089 filas en rojo diciendo exactamente eso.
 * Tres cosas mal en una linea: esta en ingles, habla de «caracteres» cuando el problema es que la
 * celda esta VACIA, y no dice que hacer para arreglarlo.
 *
 * Aqui se traduce por COLUMNA y por CASO, no con un diccionario de frases de Zod: lo que necesita
 * quien corrige un archivo no es la regla que se violo, es **que le falta a esa celda**. Por eso
 * «vacia» y «demasiado corta» son mensajes distintos aunque Zod las cuente igual.
 */
export function mensajeDeColumna(
  columna: string,
  issue: { code?: string; message?: string } | undefined,
  values: Record<string, string>,
): string {
  const rotulo = ROTULO[columna] ?? columna;
  const valor = (values[columna] ?? '').trim();

  /*
    El correo VACIO ya no es un error desde el 2026-09-21 (hay gente que no tiene, y esa persona
    entra con su cedula). Asi que aqui solo se llega cuando trae algo escrito que no es un correo, y
    eso es casi siempre un error de captura: sobra decirle que es obligatorio, porque no lo es.
  */
  if (columna === 'correo') {
    return `El correo "${valor}" está mal escrito: le falta la arroba o el dominio. Si esta persona no tiene correo, deja la celda vacía.`;
  }
  if (valor === '') {
    // El caso de nueve de cada diez, y el que traia el mensaje mas confuso.
    const comoSeArregla: Record<string, string> = {
      area: ' Si la empresa usa sub-áreas, llena también "sub_area".',
      cargo: ' Si el cargo todavía no existe en el catálogo, escribe además su "tipo_cargo".',
    };
    return `Falta "${rotulo}", y es obligatorio.${comoSeArregla[columna] ?? ''}`;
  }
  if (issue?.code === 'too_small') return `"${rotulo}" es demasiado corto: "${valor}".`;
  if (issue?.code === 'too_big') return `"${rotulo}" es demasiado largo: "${valor}".`;
  if (issue?.code === 'invalid_string') return `"${rotulo}" no tiene un formato válido: "${valor}".`;
  return `"${rotulo}" no es válido: "${valor}".`;
}

@Injectable()
export class UserImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly requirements: RequirementEngineService,
  ) {}

  /** Plantilla CSV descargable (encabezados exactos + una fila de ejemplo). */
  /**
   * LA PLANTILLA, en XLSX y con sus instrucciones dentro.
   *
   * Se cambio de CSV a XLSX por una razon sola: el cliente no sabe fabricar un CSV, y el que
   * fabrica Excel al "guardar como" sale con el separador de su region, con BOM o con las fechas
   * traducidas. Un .xlsx se abre, se llena y se sube.
   *
   * Las instrucciones van en una SEGUNDA HOJA del propio archivo y no en un correo: el archivo es
   * lo unico que seguro llega a quien lo llena.
   */
  async buildTemplateXlsx(): Promise<Buffer> {
    const libro = new ExcelJS.Workbook();
    libro.creator = 'Ascent';

    const hoja = libro.addWorksheet('Personas');
    hoja.addRow([...IMPORT_HEADERS]);
    hoja.getRow(1).font = { bold: true };
    hoja.addRow([
      '1045876321',
      'Maria Fernanda Lopez',
      'maria.lopez@correo.com',
      '3001234567',
      'Auxiliar de bodega',
      '', // tipo_cargo: vacio porque "Auxiliar de bodega" YA esta en el catalogo de ejemplo
      'Logistica',
      'Antioquia',
      'Almacenamiento',
      '2026-09-01',
      '1994-03-15',
      'DIRECTO',
    ]);
    for (const [indice] of IMPORT_HEADERS.entries()) {
      hoja.getColumn(indice + 1).width = 22;
    }

    const ayuda = libro.addWorksheet('Instrucciones');
    ayuda.getColumn(1).width = 22;
    ayuda.getColumn(2).width = 14;
    ayuda.getColumn(3).width = 80;
    ayuda.addRow(['Columna', 'Obligatoria', 'Que poner']);
    ayuda.getRow(1).font = { bold: true };

    const filas: Array<[string, string, string]> = [
      ['documento', 'SI', 'Cedula sin puntos ni espacios. Sera su usuario de ingreso. No puede repetirse.'],
      ['nombre_completo', 'SI', 'Nombres y apellidos.'],
      ['correo', 'SI', 'Personal o corporativo. No puede repetirse.'],
      ['telefono', 'No', 'Celular. Se puede dejar vacio.'],
      [
        'cargo',
        'SI',
        'El nombre o el codigo del cargo. Si NO existe todavia en Configuracion, se crea solo — con la condicion de que llenes "tipo_cargo" en esa misma fila.',
      ],
      [
        'tipo_cargo',
        'No',
        'Administrativo, Operativo o Comercial. Solo hace falta si el cargo de esa fila es NUEVO: un cargo siempre necesita un tipo, y el sistema no lo puede adivinar por el nombre.',
      ],
      ['area', 'SI', 'El nombre o el codigo del area. Si no existe, se crea sola — no necesita nada mas.'],
      ['regional', 'No', 'Sede. Vacio si no aplica. Si no existe, se crea sola.'],
      [
        'servicio',
        'No',
        'Linea de servicio (almacenamiento, masivo, paqueteo). Vacio si la empresa no la maneja. Si no existe, se crea sola.',
      ],
      ['fecha_ingreso', 'No', 'AAAA-MM-DD, por ejemplo 2026-09-01. Dispara la induccion previa al inicio.'],
      ['fecha_nacimiento', 'No', 'AAAA-MM-DD. No afecta a ninguna obligacion.'],
      ['vinculacion', 'No', 'DIRECTO, CONTRATISTA, TEMPORAL o EN_MISION. Vacio = DIRECTO.'],
    ];
    for (const fila of filas) ayuda.addRow(fila);

    ayuda.addRow([]);
    ayuda.addRow(['Reglas', '', '']);
    ayuda.getRow(ayuda.rowCount).font = { bold: true };
    for (const regla of [
      'No cambies ni traduzcas los encabezados de la primera hoja: el sistema los busca por ese nombre exacto.',
      'Maximo 2000 filas por archivo.',
      'Las filas correctas SE CREAN aunque otras tengan errores: no se pierde el trabajo.',
      'Al subirlo veras fila por fila que paso, y en las que fallen, que columna esta mal y por que.',
      'Si un area, regional, servicio o cargo se crea sobre la marcha, te lo avisa en esa fila: revisalo despues en Configuracion, por si el nombre quedo escrito distinto a como lo escribes siempre.',
      'La contrasena la genera el sistema y se muestra UNA vez: guardala en ese momento.',
    ]) {
      ayuda.addRow(['', '', regla]);
    }

    return Buffer.from(await libro.xlsx.writeBuffer());
  }

  /**
   * `simular: true` recorre TODO sin escribir una sola fila (`PENDIENTES` 5.4).
   *
   * Es el mismo metodo y no una copia a proposito: una simulacion que recorriera otro camino
   * prometeria un resultado y entregaria otro, que es peor que no simular. Los unicos `if` que
   * introduce son los que rodean cada ESCRITURA — crear catalogos, crear o actualizar a la persona,
   * el lote y la auditoria—; todo lo demas (validar, resolver catalogos, comparar campo a campo,
   * redactar el motivo) corre igual.
   */
  async import(
    actor: AuthUser,
    filename: string,
    buffer: Buffer,
    opciones: { simular?: boolean } = {},
  ): Promise<ImportResult> {
    const simular = opciones.simular === true;
    const tenantId = this.prisma.currentTenantId;
    const rawRows = await this.parseFile(filename, buffer);
    /*
      LOS TRES ERRORES QUE TUMBAN EL ARCHIVO ENTERO LLEVAN SU FRASE (2026-09-22).

      Sin `message`, el filtro de errores cae en el nombre de la clase de la excepcion y la pantalla
      acaba diciendo **«Bad Request Exception»** — que fue exactamente lo que vio el cliente al subir
      su plantilla. No dice que paso, no dice que hacer, y esta en ingles.
    */
    if (rawRows.length === 0) {
      throw new BadRequestException({
        code: 'EMPTY_FILE',
        message:
          'El archivo no tiene ninguna fila con datos debajo de los encabezados. Si llenaste otra hoja, mueve los datos a la primera.',
      });
    }
    if (rawRows.length > 2000) {
      throw new BadRequestException({
        code: 'TOO_MANY_ROWS',
        max: 2000,
        message: `El archivo trae ${rawRows.length} filas y el máximo por carga es 2000. Pártelo en varios archivos y súbelos uno tras otro.`,
      });
    }

    // Resolucion de catalogos en un solo viaje, POR CODIGO O POR NOMBRE.
    const [jobTitles, jobTitleTypes, areas, regionals, services, role] = await Promise.all([
      this.prisma.scoped.jobTitle.findMany({ where: { active: true }, select: { id: true, code: true, name: true } }),
      this.prisma.scoped.jobTitleType.findMany({ where: { active: true }, select: { id: true, code: true, name: true } }),
      this.prisma.scoped.area.findMany({ where: { active: true }, select: { id: true, code: true, name: true } }),
      this.prisma.scoped.regional.findMany({ where: { active: true }, select: { id: true, code: true, name: true } }),
      this.prisma.scoped.service.findMany({ where: { active: true }, select: { id: true, code: true, name: true } }),
      this.prisma.scoped.role.findFirst({ where: { code: 'USUARIO' }, select: { id: true } }),
    ]);
    if (!role) throw new NotFoundException({ code: 'ROLE_NOT_FOUND', role: 'USUARIO' });
    const jobTitleByCode = indexar(jobTitles);
    const jobTitleTypeByCode = indexar(jobTitleTypes);
    const areaByCode = indexar(areas);
    const regionalByCode = indexar(regionals);
    const serviceByCode = indexar(services);
    /*
      CODIGOS YA USADOS, para que un cargo/area/regional/servicio creado sobre la marcha no choque
      con uno que ya existe pero que esta escrito distinto en el Excel (Decision del 2026-09-11:
      "Auxiliar de Bodega" en el catalogo, "AUXILIAR BODEGA" tecleado en el archivo — dos nombres,
      mismo hueco de codigo si no se llevara la cuenta).
    */
    const codigosUsados = {
      jobTitle: new Set(jobTitles.map((j) => j.code)),
      area: new Set(areas.map((a) => a.code)),
      regional: new Set(regionals.map((r) => r.code)),
      service: new Set(services.map((s) => s.code)),
    };

    // Duplicados existentes en DB (un solo viaje) y duplicados internos del archivo.
    const documents = rawRows.map((r) => r.values.documento ?? '').filter(Boolean);
    const emails = rawRows.map((r) => (r.values.correo ?? '').toLowerCase()).filter(Boolean);
    const existing = await this.prisma.scoped.user.findMany({
      where: { OR: [{ documentNumber: { in: documents } }, { email: { in: emails } }] },
      select: {
        id: true,
        documentNumber: true,
        email: true,
        // Lo que una recarga puede actualizar: se trae para poder comparar y decir QUE cambio.
        fullName: true,
        phone: true,
        jobTitleId: true,
        areaId: true,
        regionalId: true,
        serviceId: true,
        hiredAt: true,
        employmentType: true,
        active: true,
      },
    });
    /*
      QUIEN YA ESTA, POR DOCUMENTO — y no un simple «existe si/no» (2026-09-21).
      Con la ficha entera se puede ACTUALIZAR en vez de rechazar. Ver `actualizarPersona`.
    */
    const existentePorDoc = new Map(existing.map((u) => [u.documentNumber, u]));
    const existingDocs = new Set(existing.map((u) => u.documentNumber));
    // Los NULOS fuera: «sin correo» no choca con «sin correo». Meterlos rechazaria a la segunda
    // persona sin correo del archivo con un «Correo ya existe» que no tendria ningun sentido.
    const existingEmails = new Set(existing.map((u) => u.email).filter((e): e is string => e !== null));
    const seenDocs = new Set<string>();
    const seenEmails = new Set<string>();

    // Una simulacion no deja lote: no paso nada que auditar, y un lote fantasma en el historial
    // haria creer que el archivo se aplico.
    const batch = simular
      ? { id: '' }
      : await this.prisma.scoped.userImportBatch.create({
          data: { tenantId, filename, status: 'PROCESSING', totalRows: rawRows.length, createdBy: actor.id },
        });

    const results: RowResult[] = [];
    for (const raw of rawRows) {
      const result = await this.processRow(raw.rowNumber, raw.values, {
        tenantId,
        roleId: role.id,
        actorId: actor.id,
        jobTitleByCode,
        jobTitleTypeByCode,
        areaByCode,
        regionalByCode,
        serviceByCode,
        codigosUsados,
        existingDocs,
        existentePorDoc,
        simular,
        existingEmails,
        seenDocs,
        seenEmails,
      });
      results.push(result);
      if (!simular) {
        await this.prisma.scoped.userImportRow.create({
          data: {
            tenantId,
            batchId: batch.id,
            rowNumber: raw.rowNumber,
            raw: raw.values,
            status: result.status,
            errorDetail: result.error ?? null,
            note: result.note ?? null,
            userId: result.userId ?? null,
          },
        });
      }
    }

    // Las obligaciones del lote nacen aqui, en una sola pasada: es el criterio de aceptacion
    // del Sprint 3 (entra gente por archivo y le nace su induccion sin que nadie la asigne).
    if (!simular) {
      await this.requirements.syncPeopleSafely(
        tenantId,
        results.map((r) => r.userId).filter((id): id is string => Boolean(id)),
      );
    }

    const ok = results.filter((r) => r.status === 'OK').length;
    const failed = results.length - ok;
    /*
      EL DESGLOSE, porque «180 filas bien» ya no dice lo mismo que antes (2026-09-21).
      Desde que una recarga actualiza en vez de rechazar, el mismo numero puede significar 180 altas
      o 180 filas que no cambiaron nada. Quien sube el archivo mensual necesita ver cuantas entraron
      de verdad y a cuantas se les cambio algo.
    */
    const creadas = results.filter((r) => r.accion === 'CREADA').length;
    const actualizadas = results.filter((r) => r.accion === 'ACTUALIZADA').length;
    const sinCambios = results.filter((r) => r.accion === 'SIN_CAMBIOS').length;
    if (!simular) {
      await this.prisma.scoped.userImportBatch.update({
        where: { id: batch.id },
        data: { status: 'COMPLETED', okRows: ok, failedRows: failed },
      });
      await this.audit.record({
        tenantId,
        userId: actor.id,
        action: 'USERS_IMPORTED',
        resourceType: 'user_import_batches',
        resourceId: batch.id,
        newValues: { filename, total: results.length, ok, failed, creadas, actualizadas, sinCambios },
      });
    }

    return {
      batchId: batch.id,
      simulacion: simular,
      total: results.length,
      ok,
      failed,
      creadas,
      actualizadas,
      sinCambios,
      rows: results,
    };
  }

  private async processRow(
    rowNumber: number,
    values: Record<string, string>,
    ctx: {
      tenantId: string;
      roleId: string;
      actorId: string;
      jobTitleByCode: Map<string, string>;
      jobTitleTypeByCode: Map<string, string>;
      areaByCode: Map<string, string>;
      regionalByCode: Map<string, string>;
      serviceByCode: Map<string, string>;
      codigosUsados: { jobTitle: Set<string>; area: Set<string>; regional: Set<string>; service: Set<string> };
      existingDocs: Set<string>;
      existentePorDoc: Map<string, PersonaExistente>;
      /** Vista previa: se recorre todo pero no se escribe nada (`PENDIENTES` 5.4). */
      simular: boolean;
      existingEmails: Set<string>;
      seenDocs: Set<string>;
      seenEmails: Set<string>;
    },
  ): Promise<RowResult> {
    const documento = values.documento ?? '';
    /*
      EL NOMBRE VIAJA CON EL ERROR (2026-09-21).

      El informe del lote enseñaba solo la cedula, y con mil filas en rojo eso obliga a abrir el
      archivo y buscar cada numero para saber de quien se trata. El nombre se toma del valor CRUDO y
      no de la fila validada a proposito: cuando la validacion falla no hay fila validada, y es justo
      cuando mas falta hace saber quien es.
    */
    const nombre = (values.nombre_completo ?? '').trim() || null;
    const fail = (error: string): RowResult => ({ rowNumber, status: 'ERROR', documento, nombre, error });

    const parsed = importRowSchema.safeParse(values);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const columna = issue?.path.join('.') ?? 'fila';
      return fail(mensajeDeColumna(columna, issue, values));
    }
    const row: ImportRowInput = parsed.data;

    /*
      ─── EL MISMO DOCUMENTO DOS VECES: DEPENDE DE DONDE (2026-09-21) ───

      Repetido DENTRO del archivo sigue siendo un error: dos filas de la misma persona en la misma
      carga son un error de quien la armo, y adivinar cual de las dos manda seria inventarse una
      respuesta que el archivo no da.

      Pero que la persona YA ESTE en el sistema no es un error: es lo normal. Una empresa no carga su
      plantilla una vez — la carga cada mes, con las altas, los cambios de cargo y los traslados de
      area mezclados con los 900 que no cambiaron. Rechazar esas 900 con «ya existe» convertia el
      archivo mensual en una lista de errores que hay que depurar a mano para encontrar las 12 filas
      nuevas, y **los traslados no entraban nunca**.

      Asi lo resuelven los LMS y los sistemas de nomina: la carga es un ESPEJO del maestro de
      personal, con el documento como clave. Si la persona esta, se actualiza; si no, se crea.
    */
    if (ctx.seenDocs.has(row.documento)) {
      return fail('Este documento viene dos veces en el mismo archivo. Deja una sola fila por persona.');
    }
    /*
      El correo solo se comprueba si HAY correo (varias personas sin correo conviven sin chocar) y si
      no es EL SUYO: al recargar el archivo mensual, cada persona trae su propio correo, y contarlo
      como repetido rechazaria a media plantilla por traer el dato que ya tenia.
    */
    const yaEstaba = ctx.existentePorDoc.get(row.documento) ?? null;
    const correoEsDeOtro = row.correo !== null && row.correo !== yaEstaba?.email;
    if (row.correo && correoEsDeOtro && (ctx.existingEmails.has(row.correo) || ctx.seenEmails.has(row.correo))) {
      return fail('Ese correo ya lo tiene otra persona, o viene repetido mas arriba en este mismo archivo.');
    }
    /*
      CARGO. Si no existe, se crea SOLO cuando la fila trae `tipo_cargo` y ese tipo ya esta
      configurado — nunca con un tipo inventado (ver el porque en `tipo_cargo` del schema).
    */
    let jobTitleId = ctx.jobTitleByCode.get(clave(row.cargo));
    let cargoCreado = false;
    if (!jobTitleId) {
      if (!row.tipo_cargo) {
        return fail(
          `Columna "cargo": "${row.cargo}" no esta en el catalogo de cargos. Para crearlo de una vez, ` +
            'escribe su tipo (Administrativo, Operativo o Comercial) en la columna "tipo_cargo"',
        );
      }
      const jobTitleTypeId = ctx.jobTitleTypeByCode.get(clave(row.tipo_cargo));
      if (!jobTitleTypeId) {
        return fail(`El tipo de cargo "${row.tipo_cargo}" no existe. Los que hay son Administrativo, Operativo y Comercial; se crean en Configuracion → Tipos de cargo`);
      }
      try {
        const codigo = codigoDesdeNombre(row.cargo, ctx.codigosUsados.jobTitle);
        const creado = ctx.simular ? { id: idSimulado(codigo) } : await this.prisma.scoped.jobTitle.create({
          select: { id: true },
          data: { tenantId: ctx.tenantId, code: codigo, name: row.cargo, jobTitleTypeId, active: true },
        });
        jobTitleId = creado.id;
        ctx.codigosUsados.jobTitle.add(codigo);
      } catch {
        return fail(`No se pudo crear el cargo "${row.cargo}". Vuelve a intentarlo; si sigue pasando, crealo en Configuracion → Cargos`);
      }
      ctx.jobTitleByCode.set(clave(row.cargo), jobTitleId);
      cargoCreado = true;
    }

    /*
      AREA, REGIONAL Y SERVICIO. A diferencia del cargo, ninguna tiene un campo obligatorio que
      haya que adivinar, asi que se crean solas cuando no existen — no hace falta pedirle nada
      extra al archivo. Se avisa igual en el resultado de la fila (ver mas abajo), para que quien
      sube el archivo sepa que paso y no se lleve una sorpresa al mirar Configuracion despues.
    */
    let areaId = ctx.areaByCode.get(clave(row.area));
    let areaCreada = false;
    if (!areaId) {
      try {
        const codigo = codigoDesdeNombre(row.area, ctx.codigosUsados.area);
        const creado = ctx.simular ? { id: idSimulado(codigo) } : await this.prisma.scoped.area.create({
          select: { id: true },
          data: { tenantId: ctx.tenantId, code: codigo, name: row.area, active: true },
        });
        areaId = creado.id;
        ctx.codigosUsados.area.add(codigo);
        ctx.areaByCode.set(clave(row.area), areaId);
        areaCreada = true;
      } catch {
        return fail(`No se pudo crear el area "${row.area}". Vuelve a intentarlo; si sigue pasando, creala en Configuracion → Areas`);
      }
    }

    /*
      LA SUB-AREA, SI VIENE (2026-09-17).

      Gestion Humana tiene Nomina, Contratacion y Seleccion. Cuando la fila la trae, **la persona
      queda en la SUB-AREA**, y esa sub-area se crea colgando del area de la columna anterior.

      Se enlaza AQUI y no a mano despues por un motivo concreto: el area de la persona decide quien
      la evalua, y una sub-area sin padre deja a su gente fuera de las reglas que apuntan al area
      grande — con el motor retirandoles las obligaciones vivas. Crearla ya enlazada cierra esa
      ventana.

      Si la sub-area YA existia, no se le toca el padre: puede estar colocada a proposito en otro
      sitio, y un archivo de personas no es quien para reorganizar el organigrama.
    */
    let subAreaCreada = false;
    if (row.sub_area) {
      const yaExiste = ctx.areaByCode.get(clave(row.sub_area));
      if (yaExiste) {
        areaId = yaExiste;
      } else {
        try {
          const codigo = codigoDesdeNombre(row.sub_area, ctx.codigosUsados.area);
          const creada = ctx.simular ? { id: idSimulado(codigo) } : await this.prisma.scoped.area.create({
            select: { id: true },
            data: { tenantId: ctx.tenantId, code: codigo, name: row.sub_area, active: true, parentId: areaId },
          });
          ctx.codigosUsados.area.add(codigo);
          ctx.areaByCode.set(clave(row.sub_area), creada.id);
          areaId = creada.id;
          subAreaCreada = true;
        } catch {
          return fail(`No se pudo crear la sub-area "${row.sub_area}". Vuelve a intentarlo; si sigue pasando, creala en Configuracion → Areas`);
        }
      }
    }

    let regionalId: string | null = row.regional ? (ctx.regionalByCode.get(clave(row.regional)) ?? null) : null;
    let regionalCreada = false;
    if (row.regional && !regionalId) {
      try {
        const codigo = codigoDesdeNombre(row.regional, ctx.codigosUsados.regional);
        const creado = ctx.simular ? { id: idSimulado(codigo) } : await this.prisma.scoped.regional.create({
          select: { id: true },
          data: { tenantId: ctx.tenantId, code: codigo, name: row.regional, active: true },
        });
        regionalId = creado.id;
        ctx.codigosUsados.regional.add(codigo);
        ctx.regionalByCode.set(clave(row.regional), regionalId);
        regionalCreada = true;
      } catch {
        return fail(`No se pudo crear la regional "${row.regional}". Vuelve a intentarlo; si sigue pasando, creala en Configuracion → Regionales`);
      }
    }

    let serviceId: string | null = row.servicio ? (ctx.serviceByCode.get(clave(row.servicio)) ?? null) : null;
    let serviceCreado = false;
    if (row.servicio && !serviceId) {
      try {
        const codigo = codigoDesdeNombre(row.servicio, ctx.codigosUsados.service);
        const creado = ctx.simular ? { id: idSimulado(codigo) } : await this.prisma.scoped.service.create({
          select: { id: true },
          data: { tenantId: ctx.tenantId, code: codigo, name: row.servicio, active: true },
        });
        serviceId = creado.id;
        ctx.codigosUsados.service.add(codigo);
        ctx.serviceByCode.set(clave(row.servicio), serviceId);
        serviceCreado = true;
      } catch {
        return fail(`No se pudo crear el servicio "${row.servicio}". Vuelve a intentarlo; si sigue pasando, crealo en Configuracion → Servicios`);
      }
    }

    const creados = [
      cargoCreado ? `cargo "${row.cargo}" (${row.tipo_cargo})` : null,
      areaCreada ? `area "${row.area}"` : null,
      subAreaCreada ? `sub-area "${row.sub_area}" dentro de "${row.area}"` : null,
      regionalCreada ? `regional "${row.regional}"` : null,
      serviceCreado ? `servicio "${row.servicio}"` : null,
    ].filter((v): v is string => v !== null);
    const avisoCatalogo = creados.length > 0 ? `Se creo en el catalogo: ${creados.join(', ')}.` : undefined;

    /*
      ─── SI YA ESTABA, SE ACTUALIZA (2026-09-21) ───

      Las tres reglas, y cada una evita un desastre distinto:

      1. **Una celda VACIA no borra nada.** Vacia significa «este archivo no lo dice», no «quitaselo».
         Lo contrario convertiria un archivo con menos columnas —o una plantilla vieja— en un borrado
         masivo de telefonos, regionales y fechas de ingreso. Para quitar un dato esta la ficha.
      2. **No se toca nada que no venga en el archivo:** ni la contraseña, ni el ROL, ni si esta
         activa, ni las politicas que firmo. Un maestro de personal dice donde trabaja alguien, no
         que permisos tiene en la plataforma — y un archivo de RR. HH. no puede ascender a nadie a
         administrador ni reactivar a quien se fue.
      3. **Se dice QUE cambio, campo por campo.** «180 actualizadas» no vale: quien sube el archivo
         necesita ver que a Fulano le cambio el area, porque **eso le mueve las obligaciones** —el
         motor retira las de la audiencia que deja y crea las de la nueva—. Un cambio de area que
         pasa en silencio es el que nadie revisa.
    */
    if (yaEstaba) {
      return this.actualizarPersona(rowNumber, row, yaEstaba, ctx, {
        jobTitleId,
        areaId,
        regionalId,
        serviceId,
        avisoCatalogo,
        nombre,
      });
    }

    const generatedPassword = generateInitialPassword(row.documento);

    /*
      EN VISTA PREVIA SE PARA AQUI. Ya se sabe todo lo que hacia falta saber —que la fila es valida y
      que esta persona NACERIA— y escribirla seria justo lo que la simulacion existe para no hacer.
      No se devuelve contraseña: la de verdad se genera el dia que se aplique, y enseñar una que no
      va a servir es peor que no enseñar ninguna.
    */
    if (ctx.simular) {
      ctx.seenDocs.add(row.documento);
      if (row.correo) ctx.seenEmails.add(row.correo);
      return { rowNumber, status: 'OK', documento: row.documento, nombre, accion: 'CREADA', note: avisoCatalogo };
    }

    let created: { id: string };
    try {
      created = await this.prisma.scoped.user.create({
        select: { id: true },
        data: {
          tenantId: ctx.tenantId,
          documentNumber: row.documento,
          fullName: row.nombre_completo,
          phone: row.telefono || null,
          email: row.correo,
          emailKind: 'PERSONAL',
          passwordHash: await argon2.hash(generatedPassword),
          mustChangePassword: true,
          jobTitleId,
          areaId,
          regionalId,
          serviceId,
          birthDate: row.fecha_nacimiento ? new Date(`${row.fecha_nacimiento}T00:00:00-05:00`) : null,
          roleId: ctx.roleId,
          hiredAt: row.fecha_ingreso ? new Date(`${row.fecha_ingreso}T00:00:00-05:00`) : null,
          employmentType: row.vinculacion || 'DIRECTO',
          createdBy: ctx.actorId,
        },
      });
    } catch {
      return fail('No se pudo guardar a esta persona. Revisa que su documento y su correo no esten ya en el sistema.');
    }

    ctx.seenDocs.add(row.documento);
    if (row.correo) ctx.seenEmails.add(row.correo);
    return {
      rowNumber,
      status: 'OK',
      documento: row.documento,
      nombre,
      accion: 'CREADA',
      note: avisoCatalogo,
      generatedPassword,
      userId: created.id,
    };
  }

  /**
   * ACTUALIZA A QUIEN YA ESTABA, y solo con lo que el archivo dice de verdad.
   *
   * No devuelve contraseña: esa persona ya tiene la suya y regenerarla la dejaria fuera de la
   * plataforma en la siguiente carga mensual, sin que nadie lo hubiera pedido.
   */
  private async actualizarPersona(
    rowNumber: number,
    row: ImportRowInput,
    antes: PersonaExistente,
    ctx: { actorId: string; tenantId: string; simular: boolean; seenDocs: Set<string>; seenEmails: Set<string> },
    resuelto: {
      jobTitleId: string;
      areaId: string;
      regionalId: string | null;
      serviceId: string | null;
      avisoCatalogo?: string;
      nombre: string | null;
    },
  ): Promise<RowResult> {
    const hiredAt = row.fecha_ingreso ? new Date(`${row.fecha_ingreso}T00:00:00-05:00`) : null;

    /*
      Cada entrada dice: como se llama el campo, que hay ahora, que trae el archivo y si el archivo
      lo dice. `dice: false` es una celda vacia, y entonces NO se toca — ver la regla 1 de arriba.
    */
    const campos: Array<{ rotulo: string; igual: boolean; dice: boolean; data: Record<string, unknown> }> = [
      {
        rotulo: 'nombre',
        dice: true,
        igual: antes.fullName === row.nombre_completo,
        data: { fullName: row.nombre_completo },
      },
      {
        rotulo: 'correo',
        dice: row.correo !== null,
        igual: antes.email === row.correo,
        data: { email: row.correo },
      },
      {
        rotulo: 'teléfono',
        dice: Boolean(row.telefono),
        igual: antes.phone === (row.telefono || null),
        data: { phone: row.telefono || null },
      },
      { rotulo: 'cargo', dice: true, igual: antes.jobTitleId === resuelto.jobTitleId, data: { jobTitleId: resuelto.jobTitleId } },
      { rotulo: 'área', dice: true, igual: antes.areaId === resuelto.areaId, data: { areaId: resuelto.areaId } },
      {
        rotulo: 'regional',
        dice: resuelto.regionalId !== null,
        igual: antes.regionalId === resuelto.regionalId,
        data: { regionalId: resuelto.regionalId },
      },
      {
        rotulo: 'servicio',
        dice: resuelto.serviceId !== null,
        igual: antes.serviceId === resuelto.serviceId,
        data: { serviceId: resuelto.serviceId },
      },
      {
        rotulo: 'fecha de ingreso',
        dice: hiredAt !== null,
        igual: antes.hiredAt?.getTime() === hiredAt?.getTime(),
        data: { hiredAt },
      },
      {
        rotulo: 'vinculación',
        dice: Boolean(row.vinculacion),
        igual: antes.employmentType === (row.vinculacion || 'DIRECTO'),
        data: { employmentType: row.vinculacion || 'DIRECTO' },
      },
    ];

    const cambios = campos.filter((campo) => campo.dice && !campo.igual);
    ctx.seenDocs.add(row.documento);
    if (row.correo) ctx.seenEmails.add(row.correo);

    if (cambios.length === 0) {
      // Nueve de cada diez filas del archivo mensual. No se escribe nada: sin esto, cada carga
      // dejaria mil filas de auditoria diciendo que no cambio nada.
      return {
        rowNumber,
        status: 'OK',
        documento: row.documento,
        nombre: resuelto.nombre,
        accion: 'SIN_CAMBIOS',
        note: resuelto.avisoCatalogo,
        userId: antes.id,
      };
    }

    const lista = cambios.map((campo) => campo.rotulo).join(', ');

    /*
      EN VISTA PREVIA SE PARA AQUI, y este es el caso que justifica toda la funcion: la lista de
      campos ya esta calculada, asi que la pantalla puede decir «a esta persona le cambiaria el
      correo y el area» ANTES de que pase. Es la unica defensa real contra subir el archivo
      equivocado y pisar una correccion hecha a mano.
    */
    if (ctx.simular) {
      return {
        rowNumber,
        status: 'OK',
        documento: row.documento,
        nombre: resuelto.nombre,
        accion: 'ACTUALIZADA',
        note: [`Cambiaría: ${lista}.`, resuelto.avisoCatalogo].filter(Boolean).join(' '),
        userId: antes.id,
      };
    }

    const data = Object.assign({}, ...cambios.map((campo) => campo.data)) as Record<string, unknown>;
    try {
      await this.prisma.scoped.user.update({ where: { id: antes.id }, data });
    } catch {
      return {
        rowNumber,
        status: 'ERROR',
        documento: row.documento,
        nombre: resuelto.nombre,
        error: 'No se pudo actualizar a esta persona. Revisa que su correo no lo tenga ya otra.',
      };
    }

    await this.audit.record({
      tenantId: ctx.tenantId,
      userId: ctx.actorId,
      action: 'USER_UPDATED_BY_IMPORT',
      resourceType: 'users',
      resourceId: antes.id,
      newValues: { documento: row.documento, campos: cambios.map((c) => c.rotulo) },
    });

    return {
      rowNumber,
      status: 'OK',
      documento: row.documento,
      nombre: resuelto.nombre,
      accion: 'ACTUALIZADA',
      note: [`Se actualizó: ${lista}.`, resuelto.avisoCatalogo].filter(Boolean).join(' '),
      userId: antes.id,
    };
  }

  /** Acepta .csv (separador ; o ,) y .xlsx. Devuelve filas crudas con su numero (1-based sin encabezado). */
  private async parseFile(filename: string, buffer: Buffer): Promise<Array<{ rowNumber: number; values: Record<string, string> }>> {
    const lower = filename.toLowerCase();
    const filas = lower.endsWith('.csv')
      ? this.parseCsv(buffer.toString('utf8'))
      : lower.endsWith('.xlsx')
        ? await this.parseXlsx(buffer)
        : null;
    if (filas === null) {
      throw new BadRequestException({
        code: 'UNSUPPORTED_FILE',
        supported: ['csv', 'xlsx'],
        message:
          'Solo se pueden subir archivos .xlsx o .csv. Si el tuyo es .xls (Excel antiguo), ábrelo y usa "Guardar como" → "Libro de Excel (.xlsx)".',
      });
    }

    // Las fechas se normalizan aqui, en un solo sitio, para que den igual el CSV y el XLSX: quien
    // corrige el archivo no tiene por que obtener un resultado distinto segun como lo guardo.
    for (const fila of filas) {
      for (const columna of COLUMNAS_DE_FECHA) {
        if (fila.values[columna] !== undefined) fila.values[columna] = normalizarFecha(fila.values[columna]);
      }
    }
    return filas;
  }

  private parseCsv(text: string): Array<{ rowNumber: number; values: Record<string, string> }> {
    const lines = text
      .replace(/^\uFEFF/, '') // BOM que agrega Excel al guardar como CSV
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0);
    if (lines.length < 2) return [];
    const sep = (lines[0] as string).includes(';') ? ';' : ',';
    const headers = (lines[0] as string).split(sep).map((h) => h.trim().toLowerCase());
    this.assertHeaders(headers);
    return lines.slice(1).map((line, i) => {
      const cells = line.split(sep);
      const values: Record<string, string> = {};
      headers.forEach((h, idx) => {
        values[h] = (cells[idx] ?? '').trim();
      });
      return { rowNumber: i + 1, values };
    });
  }

  private async parseXlsx(buffer: Buffer): Promise<Array<{ rowNumber: number; values: Record<string, string> }>> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];
    const headerRow = sheet.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: false }, (cell) => {
      headers.push(String(cell.value ?? '').trim().toLowerCase());
    });
    this.assertHeaders(headers);
    const rows: Array<{ rowNumber: number; values: Record<string, string> }> = [];
    sheet.eachRow((row, rowIndex) => {
      if (rowIndex === 1) return;
      const values: Record<string, string> = {};
      headers.forEach((h, idx) => {
        values[h] = this.textoDeCelda(row.getCell(idx + 1));
      });
      if (Object.values(values).some((v) => v.length > 0)) {
        rows.push({ rowNumber: rowIndex - 1, values });
      }
    });
    return rows;
  }

  /**
   * EL TEXTO DE UNA CELDA, con la fecha tratada aparte y ANTES que nada.
   *
   * `String(cell.text)` sobre una celda con formato de fecha devuelve el `toString()` de JavaScript:
   * *"Tue Jan 06 1998 00:00:00 GMT+0000 (Coordinated Universal Time)"*. Eso es lo que veia el
   * cliente en el informe de errores — un texto que no escribio nadie y que no se puede arreglar
   * mirando la celda, porque en Excel la celda se ve perfecta.
   */
  private textoDeCelda(cell: ExcelJS.Cell): string {
    const valor = cell.value;
    if (valor === null || valor === undefined) return '';
    if (valor instanceof Date) return comoISO(valor);
    // Una formula trae `{ formula, result }`: lo que importa es el resultado, y puede ser una fecha.
    if (typeof valor === 'object' && 'result' in valor) {
      const resultado = (valor as { result?: unknown }).result;
      if (resultado instanceof Date) return comoISO(resultado);
    }
    return String(cell.text ?? valor).trim();
  }

  /**
   * QUE COLUMNAS TIENEN QUE ESTAR, que no es lo mismo que cuales hay que llenar.
   *
   * `correo` SALIO de esta lista el 2026-09-22. Es opcional como dato desde el 2026-09-21 —hay gente
   * que no tiene— pero seguia siendo obligatoria como COLUMNA, asi que quitarla del archivo tumbaba
   * la carga entera con un 400. Una columna que se puede dejar vacia en las 1089 filas no puede ser
   * imprescindible en la primera. Y borrarla no borra nada: sin la columna, `correo` llega vacio, y
   * vacio en una recarga significa «esto no lo dice el archivo, no lo toques» (ver `actualizarPersona`).
   */
  private assertHeaders(headers: string[]): void {
    const required = IMPORT_HEADERS.filter((h) => ['documento', 'nombre_completo', 'cargo', 'area'].includes(h));
    const missing = required.filter((h) => !headers.includes(h));
    if (missing.length > 0) {
      const lista = missing.map((h) => `"${h}"`).join(', ');
      throw new BadRequestException({
        code: 'MISSING_HEADERS',
        missing,
        expected: IMPORT_HEADERS,
        message:
          `Al archivo le ${missing.length === 1 ? 'falta la columna' : 'faltan las columnas'} ${lista} en la ` +
          'primera fila. Los encabezados se escriben exactamente así, en minúscula y sin tildes. ' +
          'Descarga la plantilla si no estás seguro.',
      });
    }
  }
}
