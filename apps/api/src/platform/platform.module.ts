import { readFileSync } from 'node:fs';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PlatformAuthService } from './platform-auth.service.js';
import { PlatformController } from './platform.controller.js';
import { PlatformGuard } from './platform.guard.js';

/**
 * La capa de plataforma (Decision #100). Registra su PROPIO JwtModule con las mismas claves: los
 * tokens se firman igual y lo que los distingue es el contenido (`scope: 'platform'`, sin
 * `tenantId`), no la firma. Reutilizar las claves evita un segundo par que rotar.
 */
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({
        privateKey: readFileSync(process.env.JWT_PRIVATE_KEY_PATH as string, 'utf8'),
        publicKey: readFileSync(process.env.JWT_PUBLIC_KEY_PATH as string, 'utf8'),
        signOptions: { algorithm: 'RS256', expiresIn: process.env.JWT_ACCESS_TTL ?? '15m' },
      }),
    }),
  ],
  controllers: [PlatformController],
  providers: [PlatformAuthService, PlatformGuard],
  exports: [PlatformAuthService],
})
export class PlatformModule {}
