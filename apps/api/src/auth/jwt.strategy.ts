import { readFileSync } from 'node:fs';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PermissionService } from '../common/permission.service.js';
import type { AuthUser, JwtPayload } from '../common/types.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly permissions: PermissionService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['RS256'],
      secretOrKey: readFileSync(process.env.JWT_PUBLIC_KEY_PATH as string, 'utf8'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    if (!payload?.sub || !payload?.tenantId) throw new UnauthorizedException();
    const perms = await this.permissions.getEffectivePermissions(payload.sub, payload.tenantId);
    return {
      id: payload.sub,
      tenantId: payload.tenantId,
      roleId: payload.roleId,
      email: payload.email,
      permissions: perms,
      hasPermission: (code) => perms.has(code),
    };
  }
}
