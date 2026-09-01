import { Body, Controller, Get, HttpCode, Post, Req, Res, UnauthorizedException } from '@nestjs/common';
import { activationSchema, changePasswordSchema, loginSchema } from '@neo-pulse/shared';
import type { Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, Public } from '../common/decorators.js';
import type { AuthUser } from '../common/types.js';
import { AuthService, type LoginResult } from './auth.service.js';

const REFRESH_COOKIE = 'np_refresh';
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias (JWT_REFRESH_TTL)

/**
 * Cookie de refresh: httpOnly, path restringido a /v1/auth, valor `sessionId.tenantId.token`.
 *
 * Lleva el ID DE SESION y no el del usuario (Decision #91): una persona puede tener varias
 * abiertas —telefono y computador— y el refresco tiene que saber CUAL renovar. Con el id del
 * usuario solo cabia una, y entrar desde otro sitio tumbaba la anterior.
 *
 * El tenantId viaja tambien porque el refresco corre pre-JWT y RLS exige conocer el tenant para
 * leer la sesion (no hay cliente owner en runtime).
 */
function setRefreshCookie(res: Response, result: LoginResult, tenantId: string): void {
  res.cookie(REFRESH_COOKIE, `${result.sessionId}.${tenantId}.${result.refreshToken}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/v1/auth',
    maxAge: REFRESH_TTL_MS,
  });
}

function parseRefreshCookie(req: Request): { sessionId: string; tenantId: string; token: string } | null {
  const raw = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
  if (!raw) return null;
  const [sessionId, tenantId, token] = raw.split('.');
  if (!sessionId || !tenantId || !token) return null;
  return { sessionId, tenantId, token };
}

function requestContext(req: Request): { ipAddress: string | null; userAgent: string | null } {
  return {
    ipAddress: req.ip ?? null,
    userAgent: req.headers['user-agent'] ?? null,
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  /*
    EL LOGIN ES EL ENDPOINT MAS ATACADO y lleva su propio limite: 60 por minuto y por IP.
    
    Corta el "password spraying" —probar una contrasena comun contra seiscientas cedulas—, que el
    bloqueo por cuenta NO ve pasar porque nunca falla cinco veces seguidas en la misma cuenta.
    
    Y sesenta y no diez porque TODA LA EMPRESA SALE POR UNA IP: con diez, el segundo turno
    entrando a la vez se quedaria fuera. Contra adivinar UNA cuenta ya esta el bloqueo por cuenta
    (5 fallos, 15 minutos), que es la defensa que de verdad aplica ahi.
  */
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const input = loginSchema.parse(body);
    const result = await this.auth.login(input.tenantSlug, input.identifier, input.password, requestContext(req));
    setRefreshCookie(res, result, this.tenantIdFromAccess(result.accessToken));
    const { refreshToken: _refreshToken, ...safe } = result;
    return safe;
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const parsed = parseRefreshCookie(req);
    if (!parsed) throw new UnauthorizedException({ code: 'INVALID_REFRESH' });
    const result = await this.auth.refresh(parsed.sessionId, parsed.tenantId, parsed.token);
    setRefreshCookie(res, result, parsed.tenantId);
    const { refreshToken: _refreshToken, ...safe } = result;
    return safe;
  }

  @Post('logout')
  @HttpCode(200)
  async logout(@CurrentUser() user: AuthUser, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    // Se cierra SOLO esta sesion. Las de los otros aparatos de la misma persona siguen vivas.
    await this.auth.logout(parseRefreshCookie(req)?.sessionId ?? null, user.tenantId);
    res.clearCookie(REFRESH_COOKIE, { path: '/v1/auth' });
    return { ok: true };
  }

  @Post('change-password')
  @HttpCode(200)
  async changePassword(@CurrentUser() user: AuthUser, @Req() req: Request, @Body() body: unknown) {
    const input = changePasswordSchema.parse(body);
    // Se le pasa la sesion ACTUAL para que sea la unica que sobreviva (Decision #93).
    return this.auth.changePassword(
      user.id,
      input.currentPassword,
      input.newPassword,
      parseRefreshCookie(req)?.sessionId ?? null,
    );
  }

  @Post('activate')
  @HttpCode(200)
  async activate(@CurrentUser() user: AuthUser, @Body() body: unknown, @Req() req: Request) {
    activationSchema.parse(body);
    return this.auth.activate(user.id, user.tenantId, requestContext(req));
  }

  /**
   * El perfil de quien pregunta, con su ALCANCE.
   *
   * `scopeProcessIds` viaja aqui porque las pantallas tienen que ofrecer solo lo que la persona
   * puede usar. Sin el, el alta de una formacion ensenaba los 13 procesos de la empresa a un
   * analista que solo puede crear en el suyo, y el servidor rechazaba el guardado con un generico
   * "revisa los campos": ofrecer una opcion que va a fallar es peor que no ofrecerla.
   *
   * No cuesta una consulta extra: el alcance ya viene resuelto en el token validado.
   */
  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    const profile = await this.auth.me(user.id, user.tenantId);
    return { ...profile, scopeProcessIds: user.scopeProcessIds };
  }

  /** Extrae el tenantId del payload del access recien emitido (evita otra consulta). */
  private tenantIdFromAccess(accessToken: string): string {
    const payloadPart = accessToken.split('.')[1] ?? '';
    const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as { tenantId: string };
    return payload.tenantId;
  }
}
