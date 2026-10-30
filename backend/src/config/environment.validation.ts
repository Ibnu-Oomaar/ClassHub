import { plainToInstance, Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min, MinLength, validateSync } from 'class-validator';

/**
 * Environment variables the backend needs. The app refuses to start when one is missing or
 * invalid, so misconfiguration is caught at boot rather than at the first request.
 */
export class EnvironmentVariables {
  @IsIn(['development', 'production', 'test'])
  NODE_ENV: string = 'development';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  DB_HOST?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  DB_PORT?: number = 5432;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  DB_USERNAME?: string;

  @IsOptional()
  @IsString()
  DB_PASSWORD?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  DB_DATABASE?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  DATABASE_URL?: string;

  @IsString()
  @MinLength(32, { message: 'JWT_SECRET must be at least 32 characters. Generate one with: openssl rand -hex 48' })
  JWT_SECRET: string;

  @IsString()
  @IsNotEmpty()
  JWT_EXPIRES_IN: string = '12h';

  @IsString()
  @IsNotEmpty()
  CORS_ORIGINS: string = 'http://localhost:5173';

  @IsString()
  @IsNotEmpty()
  STORAGE_PATH: string = './storage';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  MAX_UPLOAD_MB: number = 10;

  @Type(() => Number)
  @IsInt()
  @Min(3)
  @Max(50)
  LOGIN_MAX_FAILED_ATTEMPTS: number = 5;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1440)
  LOGIN_LOCK_MINUTES: number = 15;

  /**
   * Number of reverse proxies in front of the API (0 = none, the normal local install).
   * Only set this above 0 when a proxy you control really sits in front: otherwise clients could
   * fake their IP address through the X-Forwarded-For header and sidestep rate limiting.
   */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(5)
  TRUST_PROXY: number = 0;

  /**
   * Optional TrueType fonts for PDF reports. Without them PDFs use the built-in Latin font, which cannot
   * draw Arabic or other non-Latin names (CSV exports always keep every character).
   */
  @IsOptional()
  @IsString()
  PDF_FONT_REGULAR?: string;

  @IsOptional()
  @IsString()
  PDF_FONT_BOLD?: string;

  /** Optional: full path to pg_dump / pg_restore when PostgreSQL's bin folder is not on the PATH (common on Windows). */
  @IsOptional()
  @IsString()
  PG_DUMP_PATH?: string;

  @IsOptional()
  @IsString()
  PG_RESTORE_PATH?: string;

  /** Largest backup file that can be uploaded for restoring. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10240)
  MAX_BACKUP_UPLOAD_MB: number = 1024;

  /** Optional: absolute or relative path to the built frontend so one process can serve both. */
  @IsOptional()
  @IsString()
  FRONTEND_DIST?: string;
}

export function validateEnvironment(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, { enableImplicitConversion: true });
  const errors = validateSync(validated, { skipMissingProperties: false, whitelist: false });

  if (errors.length > 0) {
    const details = errors
      .map((error) => `  - ${error.property}: ${Object.values(error.constraints ?? {}).join(', ')}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}\nCheck backend/.env (see .env.example).`);
  }

  if (validated.DATABASE_URL) {
    let databaseUrl: URL;
    try {
      databaseUrl = new URL(validated.DATABASE_URL);
    } catch {
      throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
    }

    if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol) || !databaseUrl.hostname) {
      throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
    }
    if (validated.NODE_ENV === 'production' && databaseUrl.pathname !== '/neondb') {
      throw new Error('Production DATABASE_URL must connect to the existing neondb database.');
    }
  } else if (!validated.DB_HOST || !validated.DB_USERNAME || !validated.DB_DATABASE || validated.DB_PASSWORD === undefined) {
    throw new Error('Set DATABASE_URL or provide DB_HOST, DB_USERNAME, DB_PASSWORD, and DB_DATABASE (DB_PORT defaults to 5432).');
  }

  if (validated.NODE_ENV === 'production' && validated.JWT_SECRET.startsWith('replace_with')) {
    throw new Error('JWT_SECRET still has the placeholder value from .env.example. Set a real secret before running in production.');
  }

  return validated;
}
