import { ConfigService } from '@nestjs/config';
import { resolve } from 'node:path';

export interface AppConfig {
  nodeEnv: string;
  isProduction: boolean;
  port: number;
  corsOrigins: string[];
  jwtSecret: string;
  jwtExpiresIn: string;
  storagePath: string;
  maxUploadBytes: number;
  loginMaxFailedAttempts: number;
  loginLockMinutes: number;
  trustProxyHops: number;
  frontendDist: string | null;
  pdfFontRegular: string | null;
  pdfFontBold: string | null;
  pgDumpPath: string;
  pgRestorePath: string;
  maxBackupUploadBytes: number;
}

/**
 * Reads the already-validated environment (see environment.validation.ts) into a typed object.
 * Defaults live in one place - the EnvironmentVariables class.
 */
export function loadAppConfig(config: ConfigService): AppConfig {
  const nodeEnv = config.getOrThrow<string>('NODE_ENV');
  const frontendDist = config.get<string>('FRONTEND_DIST');
  const pdfFontRegular = config.get<string>('PDF_FONT_REGULAR');
  const pdfFontBold = config.get<string>('PDF_FONT_BOLD');

  return {
    nodeEnv,
    isProduction: nodeEnv === 'production',
    port: config.getOrThrow<number>('PORT'),
    corsOrigins: config
      .getOrThrow<string>('CORS_ORIGINS')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
    jwtSecret: config.getOrThrow<string>('JWT_SECRET'),
    jwtExpiresIn: config.getOrThrow<string>('JWT_EXPIRES_IN'),
    storagePath: resolve(process.cwd(), config.getOrThrow<string>('STORAGE_PATH')),
    maxUploadBytes: config.getOrThrow<number>('MAX_UPLOAD_MB') * 1024 * 1024,
    loginMaxFailedAttempts: config.getOrThrow<number>('LOGIN_MAX_FAILED_ATTEMPTS'),
    loginLockMinutes: config.getOrThrow<number>('LOGIN_LOCK_MINUTES'),
    trustProxyHops: config.getOrThrow<number>('TRUST_PROXY'),
    frontendDist: frontendDist ? resolve(process.cwd(), frontendDist) : null,
    pdfFontRegular: pdfFontRegular ? resolve(process.cwd(), pdfFontRegular) : null,
    pdfFontBold: pdfFontBold ? resolve(process.cwd(), pdfFontBold) : null,
    pgDumpPath: config.get<string>('PG_DUMP_PATH') || 'pg_dump',
    pgRestorePath: config.get<string>('PG_RESTORE_PATH') || 'pg_restore',
    maxBackupUploadBytes: config.getOrThrow<number>('MAX_BACKUP_UPLOAD_MB') * 1024 * 1024,
  };
}
