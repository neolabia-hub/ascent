import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';

export interface PlatformActor {
  id: string;
  email: string;
  fullName: string;
}

interface PlatformJwtPayload {
  sub?: string;
  email?: string;
  name?: string;
  scope?: string;
}

/**
 * Deja pasar SOLO a un token de plataforma (Decision #100).
 *
 * LAS DOS CLASES DE TOKEN NO SE CRUZAN, y conviene ver por que en las dos direcciones:
 *
 * - Un token de TENANT no sirve aqui, porque no lleva `scope: 'platform'` y este guard lo exige.
 * - Un token de PLATAFORMA no sirve en el resto del producto, porque no lleva `tenantId` y la
 *   estrategia de siempre (`JwtStrategy`) rechaza todo lo que no lo tenga.
 *
 * Esa segunda mitad es la que importa de verdad: sin ella, una cuenta de proveedor podria hablar
 * con los endpoints de un cliente sin que RLS supiera a que empresa acotar, que es exactamente el
 * agujero que la politica de aislamiento existe para tapar.
 *
 * Las rutas de plataforma van marcadas `@Public()` para que el guard global de tenants no las
 * mire: no las abre, las saca de la cadena de los tenants para que las vigile esta.
 */
@Injectable()
export class PlatformGuard implements CanActivate {
  // La clave publica NO se lee aqui: la trae `JwtModule` desde `PlatformModule`. Leerla en el
  // guard obligaba a tener el fichero de claves en disco solo para construirlo, y eso ataba una
  // comprobacion de logica —que el scope sea el correcto— a que exista un fichero.
  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { platformUser?: PlatformActor }>();
    const header = request.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException({ code: 'PLATFORM_UNAUTHORIZED' });

    let payload: PlatformJwtPayload;
    try {
      payload = this.jwt.verify<PlatformJwtPayload>(token, { algorithms: ['RS256'] });
    } catch {
      throw new UnauthorizedException({ code: 'PLATFORM_UNAUTHORIZED' });
    }

    if (payload.scope !== 'platform' || !payload.sub) {
      throw new UnauthorizedException({ code: 'PLATFORM_UNAUTHORIZED' });
    }

    request.platformUser = {
      id: payload.sub,
      email: payload.email ?? '',
      fullName: payload.name ?? '',
    };
    return true;
  }
}
