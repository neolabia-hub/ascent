import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import ExcelJS from 'exceljs';
import { IMPORT_HEADERS, importRowSchema, type ImportRowInput } from '@neo-pulse/shared';
import { AuditService } from '../common/audit.service.js';
import type { AuthUser } from '../common/types.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { generateInitialPassword } from './password.util.js';

interface RowResult {
  rowNumber: number;
  status: 'OK' | 'ERROR';
  documento: string;
  error?: string;
  generatedPassword?: string;
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
 * espanol, validacion POR FILA (las filas buenas entran aunque otras fallen), reporte de
 * errores fila a fila y contrasena inicial generada (cedula + caracteres) devuelta UNA vez
 * para que el admin la distribuya. Todo queda en user_import_batches/rows para auditoria.
 */
@Injectable()
export class UserImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Plantilla CSV descargable (encabezados exactos + una fila de ejemplo). */
  buildTemplateCsv(): string {
    const example = [
      '1045876321',
      'Maria Fernanda Lopez',
      'maria.lopez@correo.com',
      '3001234567',
      'AUX_BODEGA',
      'LOGISTICA',
      'ANTIOQUIA',
      '2026-09-01',
      'DIRECTO',
    ];
    return `${IMPORT_HEADERS.join(';')}\n${example.join(';')}\n`;
  }

  async import(actor: AuthUser, filename: string, buffer: Buffer): Promise<ImportResult> {
    const tenantId = this.prisma.currentTenantId;
    const rawRows = await this.parseFile(filename, buffer);
    if (rawRows.length === 0) throw new BadRequestException({ code: 'EMPTY_FILE' });
    if (rawRows.length > 2000) throw new BadRequestException({ code: 'TOO_MANY_ROWS', max: 2000 });

    // Resolucion de catalogos por code, en un solo viaje.
    const [jobTitles, areas, regionals, role] = await Promise.all([
      this.prisma.scoped.jobTitle.findMany({ where: { active: true }, select: { id: true, code: true } }),
      this.prisma.scoped.area.findMany({ where: { active: true }, select: { id: true, code: true } }),
      this.prisma.scoped.regional.findMany({ where: { active: true }, select: { id: true, code: true } }),
      this.prisma.scoped.role.findFirst({ where: { code: 'USUARIO' }, select: { id: true } }),
    ]);
    if (!role) throw new NotFoundException({ code: 'ROLE_NOT_FOUND', role: 'USUARIO' });
    const jobTitleByCode = new Map(jobTitles.map((j) => [j.code, j.id]));
    const areaByCode = new Map(areas.map((a) => [a.code, a.id]));
    const regionalByCode = new Map(regionals.map((r) => [r.code, r.id]));

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
        areaByCode,
        regionalByCode,
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
          userId: null,
        },
      });
    }

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
      areaByCode: Map<string, string>;
      regionalByCode: Map<string, string>;
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
      return fail(`${issue?.path.join('.') ?? 'fila'}: ${issue?.message ?? 'invalida'}`);
    }
    const row: ImportRowInput = parsed.data;

    if (ctx.existingDocs.has(row.documento) || ctx.seenDocs.has(row.documento)) {
      return fail('Documento ya existe (en el sistema o repetido en el archivo)');
    }
    if (ctx.existingEmails.has(row.correo) || ctx.seenEmails.has(row.correo)) {
      return fail('Correo ya existe (en el sistema o repetido en el archivo)');
    }
    const jobTitleId = ctx.jobTitleByCode.get(row.cargo);
    if (!jobTitleId) return fail(`Cargo "${row.cargo}" no existe en el catalogo`);
    const areaId = ctx.areaByCode.get(row.area);
    if (!areaId) return fail(`Area "${row.area}" no existe en el catalogo`);
    const regionalId = row.regional ? ctx.regionalByCode.get(row.regional) : null;
    if (row.regional && !regionalId) return fail(`Regional "${row.regional}" no existe en el catalogo`);

    const generatedPassword = generateInitialPassword(row.documento);
    try {
      await this.prisma.scoped.user.create({
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
    return { rowNumber, status: 'OK', documento: row.documento, generatedPassword };
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
