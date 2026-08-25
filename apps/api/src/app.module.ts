import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ClsModule } from 'nestjs-cls';
import { AppController } from './app.controller.js';
import { ApprovalsModule } from './approvals/approvals.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CatalogsModule } from './catalogs/catalogs.module.js';
import { AuditService } from './common/audit.service.js';
import { JwtAuthGuard } from './common/jwt-auth.guard.js';
import { PermissionsGuard } from './common/permissions.guard.js';
import { TenantInterceptor } from './common/tenant.interceptor.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RolesModule } from './roles/roles.module.js';
import { PublicTenantsController } from './tenants/public-tenants.controller.js';
import { TenantSettingsController } from './tenants/tenant-settings.controller.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    // Carga .env (apps/api/.env) en process.env antes de instanciar el resto de modulos.
    ConfigModule.forRoot({ isGlobal: true }),
    // Contexto por request (AsyncLocalStorage) para el tenant ambiental.
    ClsModule.forRoot({ global: true, middleware: { mount: true } }),
    // Crons del sistema (dispatcher de email; futuros workers de requisitos/vencimientos).
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    NotificationsModule,
    ApprovalsModule,
    CatalogsModule,
    RolesModule,
    UsersModule,
  ],
  controllers: [AppController, PublicTenantsController, TenantSettingsController],
  providers: [
    AuditService,
    // Orden: primero autentica (JWT), luego autoriza (permisos); el interceptor fija el tenant CLS.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
  ],
})
export class AppModule {}
