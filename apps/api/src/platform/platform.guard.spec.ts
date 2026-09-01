import { UnauthorizedException } from '@nestjs/common';
import type { JwtService } from '@nestjs/jwt';
import { PlatformGuard } from './platform.guard.js';

/**
 * LAS DOS CLASES DE TOKEN NO SE CRUZAN (Decision #100).
 *
 * Es la unica barrera entre "el proveedor administra a todos los clientes" y "un administrador de
 * un cliente administra al proveedor". Si alguna vez alguien quita la comprobacion del scope
 * porque "el token ya viene firmado", estas pruebas son las que lo cazan: la firma es la misma a
 * proposito —mismas claves— y lo que separa las dos capas es el CONTENIDO.
 */
describe('PlatformGuard', () => {
  function contexto(authorization?: string) {
    const request: Record<string, unknown> = { headers: authorization ? { authorization } : {} };
    return {
      request,
      ctx: { switchToHttp: () => ({ getRequest: () => request }) } as never,
    };
  }

  function guardCon(verificado: unknown) {
    const jwt = {
      verify: () => {
        if (verificado instanceof Error) throw verificado;
        return verificado;
      },
    } as unknown as JwtService;
    return new PlatformGuard(jwt);
  }

  it('deja pasar un token de plataforma', () => {
    const guard = guardCon({ sub: 'u1', email: 'yo@neopulse.co', name: 'Yo', scope: 'platform' });
    const { ctx, request } = contexto('Bearer token');

    expect(guard.canActivate(ctx)).toBe(true);
    expect(request.platformUser).toEqual({ id: 'u1', email: 'yo@neopulse.co', fullName: 'Yo' });
  });

  it('RECHAZA un token de tenant, aunque este bien firmado', () => {
    // Un administrador de cliente presenta su token normal: valido, firmado con las mismas claves
    // y sin `scope`. Aqui no vale, y esa es toda la separacion entre las dos capas.
    const guard = guardCon({ sub: 'u1', tenantId: 't1', email: 'admin@cliente.com', roleId: 'r1' });

    expect(() => guard.canActivate(contexto('Bearer token').ctx)).toThrow(UnauthorizedException);
  });

  it('rechaza un scope inventado', () => {
    const guard = guardCon({ sub: 'u1', scope: 'admin' });

    expect(() => guard.canActivate(contexto('Bearer token').ctx)).toThrow(UnauthorizedException);
  });

  it('rechaza un token con scope correcto pero sin sujeto', () => {
    // Sin `sub` no hay a quien atribuir lo que se haga: lo que se escriba en los ajustes del
    // proveedor quedaria sin dueno.
    const guard = guardCon({ scope: 'platform' });

    expect(() => guard.canActivate(contexto('Bearer token').ctx)).toThrow(UnauthorizedException);
  });

  it('rechaza sin cabecera y con una cabecera que no es Bearer', () => {
    const guard = guardCon({ sub: 'u1', scope: 'platform' });

    expect(() => guard.canActivate(contexto().ctx)).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(contexto('Basic dXNlcjpwYXNz').ctx)).toThrow(UnauthorizedException);
  });

  it('rechaza una firma invalida', () => {
    const guard = guardCon(new Error('invalid signature'));

    expect(() => guard.canActivate(contexto('Bearer token').ctx)).toThrow(UnauthorizedException);
  });
});
