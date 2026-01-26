// src/main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import helmet from 'helmet';
import * as v8 from 'v8'; // 👈 Importamos esto para ver la memoria real

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  // 1. IMPRIMIR MEMORIA DISPONIBLE (Diagnóstico)
  const heapStats = v8.getHeapStatistics();
  const heapLimitMB = Math.round(heapStats.heap_size_limit / 1024 / 1024);
  logger.log(`💾 Límite de Memoria Node.js detectado: ${heapLimitMB} MB`);
  // Si ves ~6144 MB en los logs, tu variable NODE_OPTIONS funciona perfecto.

  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
    },
  }));

  const corsOrigins = process.env.CORS_ORIGINS?.split(',') || ['http://localhost:5173', 'http://127.0.0.1:5173'];

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-CSRF-Token',
      'X-Client-Fingerprint',
    ],
  });

  logger.log(`Orígenes CORS permitidos: ${corsOrigins.join(', ')}`);

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  }));

  app.setGlobalPrefix('api/v1');

  const port = process.env.PORT || 3000;
  await app.listen(port);

  logger.log(`🚀 Servidor iniciado en http://localhost:${port}/api/v1`);
}
bootstrap();