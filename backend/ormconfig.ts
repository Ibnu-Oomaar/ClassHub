import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { SnakeNamingStrategy } from './src/database/snake-naming.strategy';

/**
 * TypeORM connection options. Credentials and database name come from backend/.env.
 */
export function buildOrmConfig(config: ConfigService): TypeOrmModuleOptions {
  const isProduction = config.get<string>('NODE_ENV') === 'production';
  const databaseUrl = config.get<string>('DATABASE_URL');

  return {
    type: 'postgres',
    ...(databaseUrl
      ? {
          url: databaseUrl,
          ssl: { rejectUnauthorized: true },
        }
      : {
          host: config.getOrThrow<string>('DB_HOST'),
          port: config.getOrThrow<number>('DB_PORT'),
          username: config.getOrThrow<string>('DB_USERNAME'),
          password: config.get<string>('DB_PASSWORD') ?? '',
          database: config.getOrThrow<string>('DB_DATABASE'),
        }),
    autoLoadEntities: true,
    synchronize: !isProduction,
    dropSchema: false,
    uuidExtension: 'pgcrypto',
    namingStrategy: new SnakeNamingStrategy(),
    logging: isProduction ? ['error'] : ['error', 'warn', 'schema'],
    retryAttempts: 5,
    retryDelay: 2000,
  };
}