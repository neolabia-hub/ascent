import { Body, Controller, Get, HttpCode, Patch, Post, Put, Req, Res, UnauthorizedException } from '@nestjs/common';
import {
  activationSchema,
  avatarSchema,
  changePasswordSchema,
  helpRequestSchema,
  loginSchema,
  myContactSchema,
} from '@neo-pulse/shared';
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
  /*
    UNA SOLICITUD DE AYUDA CADA CINCO MINUTOS POR IP, mucho mas estrecho que el login.

    El login se usa cien veces al dia y por eso su limite es alto; esto se usa una vez cada varios
    meses y cada acierto deja un aviso en la bandeja de quien administra. Un limite generoso aqui
    seria una forma comoda de enterrar esa bandeja desde fuera.
  */
  @Throttle({ default: { ttl: 300_000, limit: 3 } })
  @Post('help-request')
  @HttpCode(202)
  async helpRequest(@Body() body: unknown, @Req() req: Request) {
    const input = helpRequestSchema.parse(body);
    await this.auth.solicitarAyudaDeIngreso(input.tenantSlug, input.identifier, requestContext(req));
    /*
      SIEMPRE 202 Y SIEMPRE EL MISMO TEXTO, exista la cuenta o no.

      Es la unica respuesta que no convierte esta pantalla —abierta, sin sesion— en un comprobador
      de quien trabaja en la empresa. Por eso tampoco dice "te avisamos cuando la restablezcan":
      no lo sabemos, y prometerlo haria que la persona se quedara esperando en vez de llamar.
    */
    return { ok: true };
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
   * puede usar. Sin el, el alta de una formacion enseñaba los 13 procesos de la empresa a un
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

  /**
   * LA FOTO DE PERFIL, que cambia SOLO su dueno (Decision #105).
   *
   * No pide ningun permiso y no recibe un id de usuario: opera sobre `user.id`, el de la sesion.
   * Es lo que impide que esto sea una via para ponerle una foto a otra persona — con un id en la
   * ruta, cualquiera con `users:manage` podria, y la foto de la cara de alguien no es un dato que
   * deba poder cambiar su jefe.
   *
   * Recibe la clave de un fichero YA SUBIDO por `/media/upload`, que es donde vive la validacion
   * de tipo real (magic bytes) y de tamaño. Aqui solo se guarda a quien pertenece.
   */
  @Put('me/avatar')
  @HttpCode(200)
  async setAvatar(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = avatarSchema.parse(body);
    return this.auth.setAvatar(user.id, user.tenantId, input.avatarKey);
  }

  /**
   * LA FICHA PROPIA, para el perfil (2026-09-24). Sin permiso y sin id, igual que la foto: cada
   * quien ve la suya y solo la suya.
   */
  @Get('me/datos')
  async misDatos(@CurrentUser() user: AuthUser) {
    return this.auth.misDatos(user.id, user.tenantId);
  }

  /** Cambia SOLO correo y telefono de quien pregunta. El resto de la ficha es de la empresa. */
  @Patch('me/contacto')
  async updateMyContact(@CurrentUser() user: AuthUser, @Body() body: unknown) {
    const input = myContactSchema.parse(body);
    return this.auth.updateMyContact(user.id, user.tenantId, input);
  }

  /** Extrae el tenantId del payload del access recien emitido (evita otra consulta). */
  private tenantIdFromAccess(accessToken: string): string {
    const payloadPart = accessToken.split('.')[1] ?? '';
    const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as { tenantId: string };
    return payload.tenantId;
  }
}
