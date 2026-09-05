import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { GlobalExceptionFilter } from './common/global-exception.filter.js';
import { initSentry } from './common/sentry.js';

async function bootstrap(): Promise<void> {
  // Lo antes posible: si hay SENTRY_DSN, activa el reporte de errores (no-op sin DSN).
  if (initSentry()) console.log('Sentry activo (observabilidad de errores).');

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  /*
    DETRAS DE UN PROXY, `req.ip` ES EL PROXY —y entonces la empresa entera es una sola IP—.

    Todo lo que se limita por IP se vuelve un limite compartido: el aviso de "no puedo entrar" son
    3 cada 5 minutos, asi que el tercero del dia dejaria a los demas sin poder pedir ayuda. Y el
    registro de auditoria guardaria la IP del proxy en vez de la de quien entro, que es justo el
    dato que se le pide al sistema cuando alguien pregunta desde donde se hizo algo.

    Se declara CUANTOS saltos de confianza hay (Cloudflare + proxy inverso = 2), no `true`: con
    `true` Express cree el primer valor de X-Forwarded-For, que lo escribe el cliente, y cualquiera
    se inventa una IP por peticion para saltarse el limite. Con un numero se toma el n-esimo por la
    derecha, que es el que escribio el proxy propio. Por defecto 0: en desarrollo no hay proxy y la
    cabecera, si llega, es mentira.
  */
  const saltosDeConfianza = Number(process.env.TRUSTED_PROXY_HOPS ?? 0);
  if (Number.isInteger(saltosDeConfianza) && saltosDeConfianza > 0) {
    app.set('trust proxy', saltosDeConfianza);
    console.log(`Proxy de confianza: ${saltosDeConfianza} salto(s); la IP del cliente sale de X-Forwarded-For.`);
  }

  app.setGlobalPrefix('v1');
  app.use(helmet());
  app.use(cookieParser());
  app.useGlobalFilters(new GlobalExceptionFilter());

  app.enableCors({
    origin: [process.env.FRONTEND_URL ?? 'http://localhost:3100'],
    credentials: true,
  });

  const port = Number(process.env.PORT ?? 3002);
  await app.listen(port);
  console.log(`NEO PULSE API en http://localhost:${port}/v1 (health: /v1/health)`);
}

void bootstrap();
