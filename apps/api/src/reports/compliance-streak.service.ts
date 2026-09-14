import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { avanzarRachaCumplimiento, type RachaCumplimiento, type RachaCumplimientoUpdate } from './compliance-streak.js';
import { ReportsService } from './reports.service.js';

/**
 * QUIEN CALCULA LA RACHA DE CUMPLIMIENTO, Y CON QUE DATO (`PENDIENTES` 8.3).
 *
 * `hayVencidos` sale de `ReportsService.vencimientos()` — el MISMO calculo que ya usa la pantalla
 * de Vencimientos y el aviso de los lunes. No se reimplementa "que cuenta como vencido" por
 * segunda vez: es la regla de oro que ya cito el propio informe de Vencimientos ("Inicio y
 * Vencimientos tienen que decir el mismo numero").
 */
@Injectable()
export class ComplianceStreakService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: ReportsService,
  ) {}

  /**
   * Recalcula la racha de un tenant con la foto de hoy. La llama el worker diario.
   * Devuelve tambien `outcome`, que el worker usa solo para el registro — la pantalla de Inicio
   * lee `obtener()`, mas abajo, que no lo expone porque no lo necesita.
   */
  async actualizar(tenantId: string, hoy: Date = new Date()): Promise<RachaCumplimientoUpdate> {
    const db = this.prisma.forTenant(tenantId);
    const [fila, vencimientos] = await Promise.all([
      db.tenantComplianceStreak.findUnique({ where: { tenantId } }),
      // Un mes basta: solo hace falta saber si HOY hay algo ya vencido, no el horizonte completo.
      this.reports.vencimientos(1, hoy, db),
    ]);

    const actual: RachaCumplimiento = fila
      ? { currentDays: fila.currentDays, longestDays: fila.longestDays, lastCheckedAt: fila.lastCheckedAt }
      : { currentDays: 0, longestDays: 0, lastCheckedAt: null };

    const nueva = avanzarRachaCumplimiento(actual, hoy, vencimientos.resumen.vencido > 0);

    await db.tenantComplianceStreak.upsert({
      where: { tenantId },
      create: { tenantId, currentDays: nueva.currentDays, longestDays: nueva.longestDays, lastCheckedAt: nueva.lastCheckedAt },
      update: { currentDays: nueva.currentDays, longestDays: nueva.longestDays, lastCheckedAt: nueva.lastCheckedAt },
    });

    return nueva;
  }

  /** Solo lee, para la pantalla de Inicio. No recalcula: eso es trabajo del worker. */
  async obtener(tenantId: string): Promise<RachaCumplimiento> {
    const fila = await this.prisma.forTenant(tenantId).tenantComplianceStreak.findUnique({ where: { tenantId } });
    return fila
      ? { currentDays: fila.currentDays, longestDays: fila.longestDays, lastCheckedAt: fila.lastCheckedAt }
      : { currentDays: 0, longestDays: 0, lastCheckedAt: null };
  }
}
