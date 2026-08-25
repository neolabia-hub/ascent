import { readFileSync } from 'node:fs';
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuditService } from '../common/audit.service.js';
import { PermissionService } from '../common/permission.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtStrategy } from './jwt.strategy.js';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      useFactory: () => ({
        privateKey: readFileSync(process.env.JWT_PRIVATE_KEY_PATH as string, 'utf8'),
        publicKey: readFileSync(process.env.JWT_PUBLIC_KEY_PATH as string, 'utf8'),
        signOptions: { algorithm: 'RS256', expiresIn: process.env.JWT_ACCESS_TTL ?? '15m' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, PermissionService, AuditService],
  exports: [PermissionService],
})
export class AuthModule {}
