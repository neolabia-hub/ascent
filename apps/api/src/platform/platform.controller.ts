import { Body, Controller, Get, HttpCode, Post, Put, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { platformLoginSchema, platformSettingsSchema } from '@neo-pulse/shared';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PlatformAuthService, type PlatformLoginResult } from './platform-auth.service.js';
import { PlatformGuard, type PlatformActor } from './platform.guard.js';

const REFRESH_COOKIE = 'np_platform_refresh';
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * COOKIE PROPIA Y RUTA PROPIA (`/v1/platform`), separada de la de los tenants.
 *
 * Si compartieran nombre, entrar como proveedor cerraria la sesion de cliente en el mismo
 * navegador y al reves — y las dos cosas se hacen a la vez todo el rato mientras se da soporte.
 * El `path` restringido es ademas lo que impide que este refresco viaje en cada peticion normal.
 */
function setRefreshCookie(res: Response, result: PlatformLoginResult): void {
  res.cookie(REFRESH_COOKIE, `${result.sessionId}.${result.refreshToken}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/v1/platform',
    maxAge: REFRESH_TTL_MS,
  });
}

function parseRefreshCookie(req: Request): { sessionId: string; token: string } | null {
  const raw = (req.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE];
  if (!raw) return null;
  const [sessionId, token] = raw.split('.');
  if (!sessionId || !token) return null;
  return { sessionId, token };
}

function actor(req: Request): PlatformActor {
  return (req as Request & { platformUser: PlatformActor }).platformUser;
}

/**
 * LA CAPA DE PLATAFORMA (Decision #100): el proveedor, no los clientes.
 *
 * Todo va `@Public()` para que el guard global de tenants no lo mire —estas rutas no tienen
 * empresa que resolver— y quien vigila de verdad es `PlatformGuard`. El ingreso y el refresco son
 * los dos unicos que ademas no lo llevan, por el mismo motivo que en cualquier ingreso: son la
 * puerta.
 *
 * Hoy solo sirve para los datos de contacto del proveedor. Es el arranque del modulo de
 * administracion de clientes (listar, dar de alta, suspender), y por eso ya trae su propia cuenta
 * y su propio ingreso: eso es lo que no se puede improvisar despues sin migrar sesiones vivas.
 */
@Controller('platform')
export class PlatformController {
  constructor(
    private readonly auth: PlatformAuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  // Mas estrecho que el de los tenants (60/min): aquel lo comparte toda una empresa detras de una
  // sola IP, este lo usan dos personas.
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @Post('auth/login')
  @HttpCode(200)
  async login(@Body() body: unknown, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const input = platformLoginSchema.parse(body);
    const result = await this.auth.login(input.email, input.password, {
      ipAddress: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
    });
    setRefreshCookie(res, result);
    const { refreshToken: _refreshToken, ...safe } = result;
    return safe;
  }

  @Public()
  @Post('auth/refresh')
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const parsed = parseRefreshCookie(req);
    if (!parsed) throw new UnauthorizedException({ code: 'INVALID_REFRESH' });
    const result = await this.auth.refresh(parsed.sessionId, parsed.token);
    setRefreshCookie(res, result);
    const { refreshToken: _refreshToken, ...safe } = result;
    return safe;
  }

  @Public()
  @UseGuards(PlatformGuard)
  @Post('auth/logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const parsed = parseRefreshCookie(req);
    if (parsed) await this.auth.logout(parsed.sessionId);
    res.clearCookie(REFRESH_COOKIE, { path: '/v1/platform' });
  }

  @Public()
  @UseGuards(PlatformGuard)
  @Get('me')
  me(@Req() req: Request) {
    return actor(req);
  }

  @Public()
  @UseGuards(PlatformGuard)
  @Get('settings')
  async settings() {
    return { settings: await this.leerAjustes() };
  }

  @Public()
  @UseGuards(PlatformGuard)
  @Put('settings')
  async saveSettings(@Body() body: unknown) {
    const input = platformSettingsSchema.parse(body);
    await this.prisma.platformSettings.update({
      where: { id: 1 },
      data: {
        supportName: input.supportName,
        supportEmail: input.supportEmail,
        supportPhone: input.supportPhone,
        supportNote: input.supportNote,
      },
    });
    return { settings: await this.leerAjustes() };
  }

  /*
    La fila 1 existe desde la migracion y el CHECK impide que haya otra. Aun asi se contempla que
    no este: una base restaurada a medias, o un despliegue donde alguien la borro a mano, no puede
    tumbar la pantalla de ingreso de todos los clientes —que es quien lee esto— por una fila.
  */
  private async leerAjustes() {
    const fila = await this.prisma.platformSettings.findUnique({ where: { id: 1 } });
    return {
      supportName: fila?.supportName ?? '',
      supportEmail: fila?.supportEmail ?? '',
      supportPhone: fila?.supportPhone ?? '',
      supportNote: fila?.supportNote ?? '',
    };
  }
}
