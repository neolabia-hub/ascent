import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { GlobalExceptionFilter } from './common/global-exception.filter.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

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
