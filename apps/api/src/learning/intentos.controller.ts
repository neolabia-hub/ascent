import { BadRequestException, Body, Controller, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, RequirePermissions } from '../common/decorators.js';
import type { AuthUser } from '../common/types.js';
import { AttemptsService } from './attempts.service.js';

const intentoExtraSchema = z.object({
  /** Por que se le da: queda en la auditoria. Corto no sirve seis meses despues. */
  motivo: z.string().trim().min(10).max(500),
});

/**
 * INTENTOS DE UNA PERSONA, desde administracion (2026-10-01). Vive aparte de `LearningController`,
 * que es `/me`: esto lo hace quien gestiona, sobre la inscripcion de otro.
 */
@Controller('enrollments')
export class IntentosController {
  constructor(private readonly attempts: AttemptsService) {}

  @Post(':id/intento-extra')
  @RequirePermissions('enrollments:unblock')
  @HttpCode(200)
  darIntentoExtra(@CurrentUser() actor: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown) {
    const parsed = intentoExtraSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Escribe el motivo (mínimo 10 caracteres).' });
    }
    return this.attempts.darIntentoExtra(actor, id, parsed.data.motivo);
  }
}
