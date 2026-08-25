import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ClsModule } from 'nestjs-cls';
import { AppController } from './app.controller.js';
import { AuthModule } from './auth/auth.module.js';
import { JwtAuthGuard } from './common/jwt-auth.guard.js';
import { PermissionsGuard } from './common/permissions.guard.js';
import { TenantInterceptor } from './common/tenant.interceptor.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { PublicTenantsController } from './tenants/public-tenants.controller.js';

@Module({
  imports: [
    // Carga .env (apps/api/.env) en process.env antes de instanciar el resto de modulos.
    ConfigModule.forRoot({ isGlobal: true }),
    // Contexto por request (AsyncLocalStorage) para el tenant ambiental.
    ClsModule.forRoot({ global: true, middleware: { mount: true } }),
    PrismaModule,
    AuthModule,
  ],
  controllers: [AppController, PublicTenantsController],
  providers: [
    // Orden: primero autentica (JWT), luego autoriza (permisos); el interceptor fija el tenant CLS.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
  ],
})
export class AppModule {}
