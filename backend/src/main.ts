import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import * as express from 'express';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from './app.module';
import { applyApiSettings } from './app.setup';
import { AppConfig, loadAppConfig } from './config/app.config';
import { NestExpressApplication } from '@nestjs/platform-express';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: false });
  const config: AppConfig = loadAppConfig(app.get(ConfigService));
  const logger = new Logger('Bootstrap');

  // Client IPs come from the socket unless TRUST_PROXY says a proxy we control sits in front.
  // Trusting X-Forwarded-For without a proxy would let anyone fake their IP and dodge rate limits.
  if (config.trustProxyHops > 0) {
    app.set('trust proxy', config.trustProxyHops);
  }
  app.disable('x-powered-by');

  app.use(
    helmet({
      // Swagger UI needs inline scripts/styles; everything else stays locked down.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          fontSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  app.enableCors({
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    exposedHeaders: ['Content-Disposition'],
    maxAge: 600,
  });

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  applyApiSettings(app);

  if (!config.isProduction) {
    const document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder()
        .setTitle('CLASSHUB API')
        .setDescription('Class management system for 3C Morning Boys')
        .setVersion('1.0')
        .addBearerAuth()
        .build(),
    );
    SwaggerModule.setup('api/docs', app, document, { swaggerOptions: { persistAuthorization: true } });
  }

  // Optional: serve the built frontend from the same process (single local install).
  if (config.frontendDist && existsSync(join(config.frontendDist, 'index.html'))) {
    app.use(express.static(config.frontendDist, { index: false, maxAge: '1h' }));
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
      res.sendFile(join(config.frontendDist as string, 'index.html'));
    });
    logger.log(`Serving frontend from ${config.frontendDist}`);
  }

  app.enableShutdownHooks();
  await app.listen(config.port, '0.0.0.0');
  logger.log(`CLASSHUB API running on http://localhost:${config.port}/api/v1`);
  if (!config.isProduction) {
    logger.log(`Swagger docs at http://localhost:${config.port}/api/docs`);
  }
}

bootstrap().catch((error: unknown) => {
  new Logger('Bootstrap').error('CLASSHUB failed to start', error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
