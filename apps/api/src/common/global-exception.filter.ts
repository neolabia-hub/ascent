import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ZodError } from 'zod';

/** Errores en formato Problem Details (RFC 9457). */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse();
    const req = host.switchToHttp().getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let title = 'Internal Server Error';
    let code: string | undefined;
    let errors: unknown;
    // Miembros de extension (RFC 9457 3.2): datos accionables junto al code (p. ej. retryAfter).
    let extensions: Record<string, unknown> = {};

    if (exception instanceof ZodError) {
      status = HttpStatus.UNPROCESSABLE_ENTITY;
      title = 'Validation failed';
      code = 'VALIDATION_ERROR';
      errors = exception.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      const detail = (typeof body === 'object' && body !== null ? body : {}) as Record<string, unknown> & {
        message?: string;
        code?: string;
      };
      title = typeof body === 'string' ? body : (detail.message ?? exception.message);
      code = detail.code;
      // Nunca se reenvia `message` crudo: puede traer detalle interno; el titulo ya lo expone.
      const { message: _message, code: _code, statusCode: _statusCode, error: _error, ...rest } = detail;
      extensions = rest;
    }

    if (status >= 500) this.logger.error(exception);

    res.status(status).type('application/problem+json').send({
      ...extensions,
      type: 'about:blank',
      title,
      status,
      code,
      instance: req.url,
      errors,
    });
  }
}
