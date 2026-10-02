import { Injectable } from '@nestjs/common';
import { ThrottlerGuard, type ThrottlerModuleOptions } from '@nestjs/throttler';
import type { ThrottlerRequest } from '@nestjs/throttler/dist/throttler.guard.interface';

/**
 * EL LIMITE DE PETICIONES, EN DOS CAPAS (2026-10-01).
 *
 * Era una sola, por IP: 300 por minuto. Todos los que entran desde la red de una misma sede
 * comparten IP publica, asi que compartian tambien los 300: una jornada de induccion con treinta
 * personas en el wifi de la oficina podia dejar a alguien con «demasiadas peticiones» sin haber
 * hecho nada raro. En produccion no habia pasado (0 rechazos en 72 horas al revisarlo), pero el
 * cliente lo vio venir. Y la regla del cliente es explicita: SEGURIDAD primero, y rendimiento.
 *
 *   1. `default` — POR IP, ANTES DE AUTENTICAR. Lo primero que ve cualquier peticion, con sesion o
 *      sin ella: es lo que frena una avalancha antes de que llegue a validar un token. Mas holgado
 *      que antes (1.500/min) porque detras de una IP puede haber una sede entera. Los endpoints
 *      sensibles lo endurecen con `@Throttle({ default: ... })` —el ingreso, el QR publico—, y
 *      esos siguen intactos.
 *   2. `persona` — POR USUARIO, DESPUES DE AUTENTICAR: 300/min por persona, como antes. Solo
 *      aplica con sesion; lo anonimo ya lo cuenta la capa 1.
 *
 * Cada peticion se cuenta UNA vez en cada capa: el guard de la capa 1 (el `ThrottlerGuard` de
 * siempre, antes de `JwtAuthGuard`) se salta `persona` porque todavia no hay usuario; este, que va
 * despues, solo atiende `persona`.
 */
export const LIMITES: ThrottlerModuleOptions = [
  { name: 'default', ttl: 60_000, limit: 1500 },
  {
    name: 'persona',
    ttl: 60_000,
    limit: 300,
    skipIf: (context) => !(context.switchToHttp().getRequest() as { user?: { id?: string } }).user?.id,
    getTracker: (req: Record<string, unknown>) => `persona:${(req.user as { id: string }).id}`,
  },
];

@Injectable()
export class ThrottlerPorPersonaGuard extends ThrottlerGuard {
  protected override async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    // La capa por IP ya la conto el guard de antes: aqui solo la de la persona.
    if (requestProps.throttler.name !== 'persona') return true;
    return super.handleRequest(requestProps);
  }
}
