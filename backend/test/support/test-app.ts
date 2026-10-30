import 'reflect-metadata';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from 'pg';
import { applyApiSettings } from '../../src/app.setup';
import { Api } from './api';

/**
 * The one database these tests may touch. Its tables are dropped every time a test file starts,
 * so it can never be the real `classhub` database: the name is fixed here, not read from `.env`.
 */
export const E2E_DATABASE = 'classhub_e2e';

type Settings = Record<string, string | undefined>;

/** Reads KEY=VALUE lines from backend/.env so the tests use the same PostgreSQL server and login as the app. */
function readEnvFile(): Settings {
  const file = join(__dirname, '..', '..', '.env');
  if (!existsSync(file)) return {};
  const values: Settings = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

function connection(settings: Settings, database: string): Client {
  return new Client({
    host: settings.DB_HOST ?? 'localhost',
    port: Number(settings.DB_PORT ?? 5432),
    user: settings.DB_USERNAME,
    password: settings.DB_PASSWORD ?? '',
    database,
  });
}

/** Empties the scratch database (creating it first if it does not exist yet). */
async function resetDatabase(settings: Settings): Promise<void> {
  let client = connection(settings, E2E_DATABASE);
  try {
    await client.connect();
  } catch (error) {
    if ((error as { code?: string }).code !== '3D000') throw error;
    const admin = connection(settings, 'postgres');
    await admin.connect();
    try {
      await admin.query(`CREATE DATABASE ${E2E_DATABASE}`);
    } finally {
      await admin.end();
    }
    client = connection(settings, E2E_DATABASE);
    await client.connect();
  }
  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');
  } finally {
    await client.end();
  }
}

export interface TestApp {
  app: NestExpressApplication;
  api: Api;
  /** Folder holding this run's uploads and backups. */
  storagePath: string;
  /** Runs SQL directly against the scratch database. */
  sql: (statement: string, parameters?: unknown[]) => Promise<Record<string, unknown>[]>;
  /** The PostgreSQL connection settings, for tests that check the database from outside the app. */
  settings: Settings;
  /** Stops the app. Pass true to keep the storage folder, for a test that starts the app again afterwards. */
  close: (keepStorage?: boolean) => Promise<void>;
}

/**
 * Starts the real application (every module, guard, filter and interceptor) on a random port,
 * against an empty scratch database and a temporary storage folder.
 */
export async function createTestApp(ipBlock = 1, options: { keepData?: boolean; storagePath?: string } = {}): Promise<TestApp> {
  const settings: Settings = { ...readEnvFile(), ...process.env };
  if (!settings.DB_USERNAME) {
    throw new Error('The end-to-end tests need PostgreSQL settings. Create backend/.env (copy .env.example) first.');
  }
  // Starting again on the same database (keepData) is how a test checks that records survive a restart.
  if (!options.keepData) await resetDatabase(settings);

  const storagePath = options.storagePath ?? mkdtempSync(join(tmpdir(), 'classhub-e2e-'));
  Object.assign(process.env, {
    NODE_ENV: 'test',
    DB_HOST: settings.DB_HOST ?? 'localhost',
    DB_PORT: settings.DB_PORT ?? '5432',
    DB_USERNAME: settings.DB_USERNAME,
    DB_PASSWORD: settings.DB_PASSWORD ?? '',
    DB_DATABASE: E2E_DATABASE,
    JWT_SECRET: settings.JWT_SECRET ?? 'end-to-end-test-secret-that-is-long-enough-123456',
    STORAGE_PATH: storagePath,
    LOGIN_MAX_FAILED_ATTEMPTS: '5',
    LOGIN_LOCK_MINUTES: '15',
  });

  // Imported only now: the configuration is read when the module is first loaded.
  const { AppModule } = await import('../../src/app.module');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: ['error'] });
  app.set('trust proxy', 1);
  applyApiSettings(app);
  await app.init();
  await app.listen(0, '127.0.0.1');
  const { port } = app.getHttpServer().address() as AddressInfo;

  return {
    app,
    api: new Api(`http://127.0.0.1:${port}/api/v1`, ipBlock),
    storagePath,
    settings,
    sql: async (statement, parameters = []) => {
      const client = connection(settings, E2E_DATABASE);
      await client.connect();
      try {
        return (await client.query(statement, parameters)).rows;
      } finally {
        await client.end();
      }
    },
    close: async (keepStorage = false) => {
      await app.close();
      if (!keepStorage) rmSync(storagePath, { recursive: true, force: true });
    },
  };
}

export const CLASS_MASTER = { fullName: 'Amina Yusuf', username: 'classmaster', password: 'Secret123' };

/** Completes first-run setup and returns the Class Master's access token. */
export async function setUpClassMaster(api: Api): Promise<string> {
  const setup = await api.post('/setup/initial', undefined, { ...CLASS_MASTER, confirmPassword: CLASS_MASTER.password });
  if (setup.status !== 201) throw new Error(`Setup failed: ${setup.status} ${JSON.stringify(setup.json)}`);
  return api.login('/auth/class-master-login', { identifier: CLASS_MASTER.username, password: CLASS_MASTER.password });
}

/** POST as the Class Master and return the created record. */
export async function create<T = { id: string }>(api: Api, token: string, path: string, body: unknown): Promise<T> {
  const response = await api.post(path, token, body);
  if (response.status !== 201 && response.status !== 200) {
    throw new Error(`POST ${path} failed: ${response.status} ${JSON.stringify(response.json)}`);
  }
  return response.json.data as T;
}
