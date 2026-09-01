import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ClsModule } from 'nestjs-cls';
import { ActivitiesModule } from './activities/activities.module.js';
import { AppController } from './app.controller.js';
import { ApprovalsModule } from './approvals/approvals.module.js';
import { AssessmentsModule } from './assessments/assessments.module.js';
import { AssignmentsModule } from './assignments/assignments.module.js';
import { AuthModule } from './auth/auth.module.js';
import { CatalogsModule } from './catalogs/catalogs.module.js';
import { AuditService } from './common/audit.service.js';
import { JwtAuthGuard } from './common/jwt-auth.guard.js';
import { PermissionsGuard } from './common/permissions.guard.js';
import { TenantInterceptor } from './common/tenant.interceptor.js';
import { LearningModule } from './learning/learning.module.js';
import { LessonsModule } from './lessons/lessons.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { OfferingsModule } from './offerings/offerings.module.js';
import { PlansModule } from './plans/plans.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RolesModule } from './roles/roles.module.js';
import { StorageModule } from './storage/storage.module.js';
import { PublicTenantsController } from './tenants/public-tenants.controller.js';
import { TenantSettingsController } from './tenants/tenant-settings.controller.js';
import { UsersModule } from './users/users.module.js';
import { WorkersModule } from './workers/workers.module.js';

@Module({
  imports: [
    // Carga .env (apps/api/.env) en process.env antes de instanciar el resto de modulos.
    ConfigModule.forRoot({ isGlobal: true }),
    /*
      LIMITE POR IP (Decision #93).
      
      El bloqueo por CUENTA ya existia —5 intentos fallidos y quince minutos— y no basta: protege
      a UNA cuenta contra quien adivina su contrasena, pero no protege al sistema de quien prueba
      una contrasena comun contra SEISCIENTAS cedulas seguidas. Ese ataque (password spraying)
      nunca falla cinco veces en la misma cuenta, asi que el bloqueo por cuenta no lo ve pasar.
      
      LOS NUMEROS SON ALTOS A PROPOSITO, y esto es lo que mas cuesta acertar aqui.
      
      TODA LA EMPRESA SALE POR UNA SOLA IP. En TRANSPRENSA, seiscientas personas comparten la
      salida a internet de la oficina, asi que "por IP" no significa "por persona": significa "por
      toda la empresa a la vez". Un limite bajo no para a un atacante —que viene de fuera y solo,
      con su propia IP— pero SI deja fuera a un turno entero entrando a las 6 de la manana.
      
      Se probo con 30/minuto y rompio el uso normal: cargar una pantalla del aprendiz dispara
      cinco peticiones, asi que seis pantallas agotaban el cupo de la empresa entera.
      
      El reparto que queda: 300/minuto en general y 60/minuto en el login. Corta el volumen
      absurdo —un script probando miles de contrasenas— sin tocar a nadie real. La defensa fina
      contra adivinar UNA cuenta no es esta: es el bloqueo POR CUENTA que ya existe (5 fallos, 15
      minutos), que no le importa desde donde vengan.
      
      HONESTO SOBRE SU ALCANCE: el contador vive en la memoria del proceso. Con una sola instancia
      —el despliegue de hoy— es exacto; con varias, cada una llevaria el suyo y el limite efectivo
      se multiplicaria. Cuando haya mas de una instancia esto necesita un almacen compartido
      (Redis ya esta en el compose), y ademas leer la IP REAL de la cabecera del proxy: sin eso,
      todas las peticiones parecen venir del proxy y el limite se aplicaria a todo el mundo junto.
    */
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
    // Contexto por request (AsyncLocalStorage) para el tenant ambiental.
    ClsModule.forRoot({ global: true, middleware: { mount: true } }),
    // Crons del sistema (dispatcher de email; futuros workers de requisitos/vencimientos).
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    NotificationsModule,
    ApprovalsModule,
    StorageModule,
    CatalogsModule,
    RolesModule,
    // AssignmentsModule antes que UsersModule: el alta de personas usa su motor de requisitos.
    AssignmentsModule,
    UsersModule,
    // Catalogo formativo (Sprint 2).
    ActivitiesModule,
    LessonsModule,
    AssessmentsModule,
    // Convocatorias, plan anual y sus trabajos programados (Sprint 3).
    OfferingsModule,
    PlansModule,
    WorkersModule,
    // Experiencia del colaborador: reproductor, examenes y repaso espaciado (Sprint 4).
    LearningModule,
  ],
  controllers: [AppController, PublicTenantsController, TenantSettingsController],
  providers: [
    // El limite por IP se aplica a TODO por defecto; los endpoints sensibles lo endurecen.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    AuditService,
    // Orden: primero autentica (JWT), luego autoriza (permisos); el interceptor fija el tenant CLS.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
  ],
})
export class AppModule {}
