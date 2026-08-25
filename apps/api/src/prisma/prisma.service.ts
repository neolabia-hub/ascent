import { Injectable, InternalServerErrorException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { CLS_TENANT_ID } from '../common/request-context.js';

/**
 * PrismaService — cliente base (rol de app, sujeto a RLS) + `forTenant()` con aislamiento por tenant.
 *
 * Defensa en profundidad (Decision #17):
 *  - Capa 2 (RLS): `forTenant(tenantId)` envuelve CADA operacion en una transaccion que primero
 *    ejecuta `set_config('app.tenant_id', tenantId, TRUE)` (= SET LOCAL). Como el SET y la query
 *    comparten transaccion, RLS aisla TODOS los modelos automaticamente, incluso con pool.
 *  - Capa 1 (ORM): los handlers usan siempre el cliente tenant-bound (`scoped`).
 *
 * A diferencia de SAC-NEO, aqui NO existe cliente owner en runtime: el tenant se conoce ANTES del
 * login (subdominio -> slug, Decision #32), y la tabla `tenants` no esta bajo RLS (el rol de app
 * puede resolver el slug). Migraciones/seed usan DIRECT_DATABASE_URL por fuera de la app.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(private readonly cls: ClsService) {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /** tenantId del contexto CLS actual (poblado por TenantInterceptor tras autenticar). */
  get currentTenantId(): string {
    const tenantId = this.cls.get<string>(CLS_TENANT_ID);
    if (!tenantId) {
      throw new InternalServerErrorException({ code: 'TENANT_CONTEXT_MISSING' });
    }
    return tenantId;
  }

  /**
   * Cliente tenant-bound AMBIENTAL: usa el tenantId del contexto CLS. Uso normal en handlers
   * autenticados: `this.prisma.scoped.activity.findMany(...)` — ya aislado, sin pasar tenantId.
   */
  get scoped(): TenantPrisma {
    return this.forTenant(this.currentTenantId);
  }

  /**
   * Transaccion interactiva con RLS activo para el tenant del contexto: TODAS las queries de `fn`
   * comparten transaccion (atomicidad real). Necesaria para numeracion con row-lock
   * (sequence_counters) y escrituras cruzadas.
   */
  async tx<T>(fn: (client: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.txForTenant(this.currentTenantId, fn);
  }

  /** Igual que `tx()` pero con tenant EXPLICITO (workers de sistema, flujos pre-CLS como login). */
  async txForTenant<T>(tenantId: string, fn: (client: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return this.$transaction(async (client) => {
      await client.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, TRUE)`;
      return fn(client);
    });
  }

  /** Cliente atado a un tenant explicito: toda query corre con RLS activo para ese tenant. */
  forTenant(tenantId: string) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias -- dentro de $allOperations `this` NO es el client (patron de extension Prisma).
    const base: PrismaClient = this;
    return this.$extends({
      query: {
        $allModels: {
          async $allOperations({ args, query }) {
            // set_config(..., TRUE) = SET LOCAL (scope de transaccion).
            const [, result] = await base.$transaction([
              base.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, TRUE)`,
              query(args),
            ]);
            return result;
          },
        },
      },
    });
  }
}

export type TenantPrisma = ReturnType<PrismaService['forTenant']>;
