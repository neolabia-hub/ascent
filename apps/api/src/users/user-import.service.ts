import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import ExcelJS from 'exceljs';
import { IMPORT_HEADERS, importRowSchema, type ImportRowInput } from '@neo-pulse/shared';
import { RequirementEngineService } from '../assignments/requirement-engine.service.js';
import { AuditService } from '../common/audit.service.js';
import type { AuthUser } from '../common/types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { generateInitialPassword } from './password.util.js';

interface RowResult {
  rowNumber: number;
  status: 'OK' | 'ERROR';
  documento: string;
  error?: string;
  /** No es un error: informa que un cargo/area/regional/servicio se creo solo, sobre la marcha. */
  note?: string;
  generatedPassword?: string;
  /** Id de la persona creada: enlaza la fila del lote y alimenta el motor de requisitos. */
  userId?: string;
}

export interface ImportResult {
  batchId: string;
  total: number;
  ok: number;
  failed: number;
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

  async import(actor: AuthUser, filename: string, buffer: Buffer): Promise<ImportResult> {
    const tenantId = this.prisma.currentTenantId;
    const rawRows = await this.parseFile(filename, buffer);
    if (rawRows.length === 0) throw new BadRequestException({ code: 'EMPTY_FILE' });
    if (rawRows.length > 2000) throw new BadRequestException({ code: 'TOO_MANY_ROWS', max: 2000 });

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
      select: { documentNumber: true, email: true },
    });
    const existingDocs = new Set(existing.map((u) => u.documentNumber));
    const existingEmails = new Set(existing.map((u) => u.email));
    const seenDocs = new Set<string>();
    const seenEmails = new Set<string>();

    const batch = await this.prisma.scoped.userImportBatch.create({
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
        existingEmails,
        seenDocs,
        seenEmails,
      });
      results.push(result);
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

    // Las obligaciones del lote nacen aqui, en una sola pasada: es el criterio de aceptacion
    // del Sprint 3 (entra gente por archivo y le nace su induccion sin que nadie la asigne).
    await this.requirements.syncPeopleSafely(
      tenantId,
      results.map((r) => r.userId).filter((id): id is string => Boolean(id)),
    );

    const ok = results.filter((r) => r.status === 'OK').length;
    const failed = results.length - ok;
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
      newValues: { filename, total: results.length, ok, failed },
    });

    return { batchId: batch.id, total: results.length, ok, failed, rows: results };
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
      existingEmails: Set<string>;
      seenDocs: Set<string>;
      seenEmails: Set<string>;
    },
  ): Promise<RowResult> {
    const documento = values.documento ?? '';
    const fail = (error: string): RowResult => ({ rowNumber, status: 'ERROR', documento, error });

    const parsed = importRowSchema.safeParse(values);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const columna = issue?.path.join('.') ?? 'fila';
      return fail(`Columna "${columna}": ${issue?.message ?? 'valor invalido'}`);
    }
    const row: ImportRowInput = parsed.data;

    if (ctx.existingDocs.has(row.documento) || ctx.seenDocs.has(row.documento)) {
      return fail('Documento ya existe (en el sistema o repetido en el archivo)');
    }
    if (ctx.existingEmails.has(row.correo) || ctx.seenEmails.has(row.correo)) {
      return fail('Correo ya existe (en el sistema o repetido en el archivo)');
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
        return fail(`Columna "tipo_cargo": "${row.tipo_cargo}" no esta en el catalogo de tipos de cargo`);
      }
      try {
        const codigo = codigoDesdeNombre(row.cargo, ctx.codigosUsados.jobTitle);
        const creado = await this.prisma.scoped.jobTitle.create({
          select: { id: true },
          data: { tenantId: ctx.tenantId, code: codigo, name: row.cargo, jobTitleTypeId, active: true },
        });
        jobTitleId = creado.id;
        ctx.codigosUsados.jobTitle.add(codigo);
      } catch {
        return fail(`No se pudo crear el cargo "${row.cargo}" (posible choque concurrente)`);
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
        const creado = await this.prisma.scoped.area.create({
          select: { id: true },
          data: { tenantId: ctx.tenantId, code: codigo, name: row.area, active: true },
        });
        areaId = creado.id;
        ctx.codigosUsados.area.add(codigo);
        ctx.areaByCode.set(clave(row.area), areaId);
        areaCreada = true;
      } catch {
        return fail(`No se pudo crear el area "${row.area}" (posible choque concurrente)`);
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
          const creada = await this.prisma.scoped.area.create({
            select: { id: true },
            data: { tenantId: ctx.tenantId, code: codigo, name: row.sub_area, active: true, parentId: areaId },
          });
          ctx.codigosUsados.area.add(codigo);
          ctx.areaByCode.set(clave(row.sub_area), creada.id);
          areaId = creada.id;
          subAreaCreada = true;
        } catch {
          return fail(`No se pudo crear la sub-area "${row.sub_area}" (posible choque concurrente)`);
        }
      }
    }

    let regionalId: string | null = row.regional ? (ctx.regionalByCode.get(clave(row.regional)) ?? null) : null;
    let regionalCreada = false;
    if (row.regional && !regionalId) {
      try {
        const codigo = codigoDesdeNombre(row.regional, ctx.codigosUsados.regional);
        const creado = await this.prisma.scoped.regional.create({
          select: { id: true },
          data: { tenantId: ctx.tenantId, code: codigo, name: row.regional, active: true },
        });
        regionalId = creado.id;
        ctx.codigosUsados.regional.add(codigo);
        ctx.regionalByCode.set(clave(row.regional), regionalId);
        regionalCreada = true;
      } catch {
        return fail(`No se pudo crear la regional "${row.regional}" (posible choque concurrente)`);
      }
    }

    let serviceId: string | null = row.servicio ? (ctx.serviceByCode.get(clave(row.servicio)) ?? null) : null;
    let serviceCreado = false;
    if (row.servicio && !serviceId) {
      try {
        const codigo = codigoDesdeNombre(row.servicio, ctx.codigosUsados.service);
        const creado = await this.prisma.scoped.service.create({
          select: { id: true },
          data: { tenantId: ctx.tenantId, code: codigo, name: row.servicio, active: true },
        });
        serviceId = creado.id;
        ctx.codigosUsados.service.add(codigo);
        ctx.serviceByCode.set(clave(row.servicio), serviceId);
        serviceCreado = true;
      } catch {
        return fail(`No se pudo crear el servicio "${row.servicio}" (posible choque concurrente)`);
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

    const generatedPassword = generateInitialPassword(row.documento);
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
      return fail('Error al crear el usuario (posible duplicado concurrente)');
    }

    ctx.seenDocs.add(row.documento);
    ctx.seenEmails.add(row.correo);
    return { rowNumber, status: 'OK', documento: row.documento, note: avisoCatalogo, generatedPassword, userId: created.id };
  }

  /** Acepta .csv (separador ; o ,) y .xlsx. Devuelve filas crudas con su numero (1-based sin encabezado). */
  private async parseFile(filename: string, buffer: Buffer): Promise<Array<{ rowNumber: number; values: Record<string, string> }>> {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.csv')) return this.parseCsv(buffer.toString('utf8'));
    if (lower.endsWith('.xlsx')) return this.parseXlsx(buffer);
    throw new BadRequestException({ code: 'UNSUPPORTED_FILE', supported: ['csv', 'xlsx'] });
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
        const cell = row.getCell(idx + 1);
        values[h] = cell.value === null || cell.value === undefined ? '' : String(cell.text ?? cell.value).trim();
      });
      if (Object.values(values).some((v) => v.length > 0)) {
        rows.push({ rowNumber: rowIndex - 1, values });
      }
    });
    return rows;
  }

  private assertHeaders(headers: string[]): void {
    const required = IMPORT_HEADERS.filter((h) => ['documento', 'nombre_completo', 'correo', 'cargo', 'area'].includes(h));
    const missing = required.filter((h) => !headers.includes(h));
    if (missing.length > 0) {
      throw new BadRequestException({ code: 'MISSING_HEADERS', missing, expected: IMPORT_HEADERS });
    }
  }
}
