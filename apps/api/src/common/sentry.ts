import * as Sentry from '@sentry/node';

/**
 * Observabilidad de errores (CLAUDE.md 10.5): todo 5xx llega a Sentry con contexto.
 * Sin SENTRY_DSN no hace nada, asi que desarrollo y pruebas funcionan igual sin configurar nada.
 */
let enabled = false;

export function initSentry(): boolean {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    // Muestreo de rendimiento bajo: interesa el error, no el trazado completo (y el VPS es modesto).
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.05),
    // Nunca enviar datos personales del cuerpo de la peticion: hay cedulas y correos.
    sendDefaultPii: false,
  });
  enabled = true;
  return true;
}

export function captureError(error: unknown, context?: Record<string, unknown>): void {
  if (!enabled) return;
  Sentry.captureException(error, context ? { extra: context } : undefined);
}
