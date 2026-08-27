import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type SequenceEntity = 'OFFERING' | 'CERTIFICATE' | 'PLAN';

/**
 * Numeracion visible por tenant y ano (CONV-2026-000001, CERT-2026-000123).
 *
 * El UUID es la llave real; este numero es el identificador legal y humano, y por eso no puede
 * saltarse ni repetirse. Se reserva con un UPSERT que devuelve el valor incrementado: Postgres
 * bloquea la fila del contador dentro de la transaccion, asi que dos altas simultaneas obtienen
 * numeros distintos sin que ninguna espere de mas.
 *
 * SIEMPRE dentro de la transaccion del alta: si el alta falla, el numero no se consume.
 */
@Injectable()
export class SequenceService {
  async next(
    tx: Prisma.TransactionClient,
    tenantId: string,
    entityType: SequenceEntity,
    year: number,
  ): Promise<number> {
    const rows = await tx.$queryRaw<Array<{ last_value: bigint }>>(Prisma.sql`
      INSERT INTO sequence_counters (tenant_id, entity_type, year, last_value)
      VALUES (${tenantId}::uuid, ${entityType}, ${year}, 1)
      ON CONFLICT (tenant_id, entity_type, year)
      DO UPDATE SET last_value = sequence_counters.last_value + 1
      RETURNING last_value
    `);
    return Number(rows[0]?.last_value ?? 1);
  }

  /** Formato visible: PREFIJO-ANO-000001. */
  format(prefix: string, year: number, value: number): string {
    return `${prefix}-${year}-${String(value).padStart(6, '0')}`;
  }
}
