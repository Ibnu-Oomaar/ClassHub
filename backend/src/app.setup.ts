import { INestApplication, ValidationPipe } from '@nestjs/common';

/** Every route lives under this prefix, e.g. /api/v1/students. */
export const API_PREFIX = 'api/v1';

/**
 * The request handling every environment needs: the URL prefix and strict input validation.
 * main.ts and the end-to-end tests both call it, so the tests exercise the same rules as production.
 * Unknown fields are rejected (not silently dropped), so a client cannot slip in `role` or `status`.
 */
export function applyApiSettings(app: INestApplication): void {
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
      stopAtFirstError: false,
    }),
  );
}
