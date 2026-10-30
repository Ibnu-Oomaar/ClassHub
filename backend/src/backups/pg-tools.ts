import { execFile } from 'node:child_process';

export interface ToolResult {
  stdout: string;
  stderr: string;
}

export class ToolError extends Error {
  constructor(
    message: string,
    /** True when the program itself could not be started (not installed / wrong path). */
    readonly notFound: boolean,
    readonly stderr: string,
  ) {
    super(message);
  }
}

export interface DatabaseTarget {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

/** Connection flags. The password never appears here: it travels in the PGPASSWORD environment variable. */
export function connectionArgs(target: DatabaseTarget): string[] {
  return ['--no-password', '--host', target.host, '--port', String(target.port), '--username', target.username, '--dbname', target.database];
}

/**
 * Runs a PostgreSQL command-line tool WITHOUT a shell (arguments are passed as an array, so nothing
 * a user typed can be interpreted as a command).
 */
export function runTool(
  program: string,
  args: string[],
  options: { password?: string; timeoutMs?: number; pgOptions?: string } = {},
): Promise<ToolResult> {
  return new Promise((resolve, reject) => {
    execFile(
      program,
      args,
      {
        timeout: options.timeoutMs ?? 30 * 60_000,
        maxBuffer: 32 * 1024 * 1024,
        windowsHide: true,
        env: { ...process.env, PGPASSWORD: options.password ?? '', ...(options.pgOptions ? { PGOPTIONS: options.pgOptions } : {}) },
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({ stdout, stderr });
          return;
        }
        const code = (error as NodeJS.ErrnoException).code;
        if (code === 'ENOENT' || code === 'EACCES') {
          reject(new ToolError(`${program} could not be started.`, true, ''));
          return;
        }
        // Keep only the tail of the tool's message: it explains the failure and never contains the password.
        const detail = String(stderr || error.message).trim().split('\n').slice(-6).join(' ').slice(0, 600);
        reject(new ToolError(detail || 'The PostgreSQL tool failed.', false, String(stderr)));
      },
    );
  });
}

/** `pg_dump (PostgreSQL) 16.15 (...)` -> `16.15`. Null when the tool is missing. */
export async function readVersion(program: string): Promise<string | null> {
  try {
    const { stdout } = await runTool(program, ['--version'], { timeoutMs: 10_000 });
    return /(\d+(?:\.\d+)+)/.exec(stdout)?.[1] ?? stdout.trim();
  } catch {
    return null;
  }
}

/** Table names listed in a custom-format dump's table of contents (`pg_restore --list`). */
export function tablesInListing(listing: string): Set<string> {
  const tables = new Set<string>();
  for (const match of listing.matchAll(/\bTABLE\s+public\s+([a-z0-9_]+)\b/g)) tables.add(match[1]);
  return tables;
}

/** A dump is accepted as a CLASSHUB backup only when it contains the core tables. */
export const REQUIRED_TABLES = ['users', 'app_settings', 'audit_logs'] as const;
