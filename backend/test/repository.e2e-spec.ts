import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, extname, join, relative, sep } from 'node:path';

/**
 * Checks on the project's files themselves (no database needed): the rules the build was held to,
 * kept as tests so they cannot quietly be broken later.
 */

const BACKEND = join(__dirname, '..');
const ROOT = join(BACKEND, '..');
const FRONTEND = join(ROOT, 'frontend');
const SKIPPED_FOLDERS = new Set(['node_modules', 'dist', 'storage', 'coverage', '.git', '.vscode', '.idea']);

function walk(folder: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(folder)) {
    if (SKIPPED_FOLDERS.has(name)) continue;
    const path = join(folder, name);
    if (statSync(path).isDirectory()) found.push(...walk(path));
    else found.push(path);
  }
  return found;
}

const rel = (path: string) => relative(ROOT, path).split(sep).join('/');
const read = (path: string) => readFileSync(path, 'utf8');
const allFiles = walk(ROOT);
const isCode = (path: string) => /\.(ts|tsx)$/.test(path);
const isSpec = (path: string) => /(\.spec\.|\.e2e-spec\.|\.test\.)/.test(path) || rel(path).includes('/test/');
const backendSource = walk(join(BACKEND, 'src')).filter((f) => isCode(f) && !isSpec(f));
const frontendSource = walk(join(FRONTEND, 'src')).filter((f) => isCode(f) && !isSpec(f));
const backendPackage = JSON.parse(read(join(BACKEND, 'package.json')));
const frontendPackage = JSON.parse(read(join(FRONTEND, 'package.json')));
const dependencyNames = (pkg: { dependencies?: object; devDependencies?: object }) => [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.devDependencies ?? {}),
];

describe('The project', () => {
  describe('technology rules', () => {
    it('has no Prisma, Docker, migration or seed files anywhere', () => {
      const forbidden = allFiles.filter((f) => /(prisma|docker|compose\.ya?ml|seed|seeder|migration)/i.test(basename(f)));
      expect(forbidden.map(rel)).toEqual([]);
    });

    it('has no folders named for migrations, seeds or fixtures', () => {
      const folders = new Set(allFiles.map((f) => rel(f).split('/').slice(0, -1)).flat());
      for (const name of ['migrations', 'migration', 'seeds', 'seeders', 'seed', 'fixtures', 'prisma']) expect(folders.has(name)).toBe(false);
    });

    it('depends on no ORM other than TypeORM, and on no seeding, fake-data or hosted-database package', () => {
      const names = [...dependencyNames(backendPackage), ...dependencyNames(frontendPackage)];
      const banned = /^(@prisma\/.*|prisma|sequelize|mongoose|knex|mikro-orm|@mikro-orm\/.*|typeorm-seeding|typeorm-extension|@faker-js\/faker|faker|chance|casual|firebase|@supabase\/.*|dockerode)$/;
      expect(names.filter((n) => banned.test(n))).toEqual([]);
      expect(Object.keys(backendPackage.dependencies)).toEqual(expect.arrayContaining(['typeorm', '@nestjs/typeorm', 'pg']));
    });

    it('turns TypeORM synchronization on, and never turns it off', () => {
      const config = read(join(BACKEND, 'src', 'config', 'database.config.ts'));
      expect(config).toMatch(/synchronize:\s*true/);
      for (const file of backendSource) expect(read(file)).not.toMatch(/synchronize:\s*false/);
    });

    it('configures no migrations and no schema dropping at start-up', () => {
      const config = read(join(BACKEND, 'src', 'config', 'database.config.ts')).replace(/\/\*[\s\S]*?\*\//g, '');
      expect(config).not.toMatch(/migrations/i);
      expect(config).not.toMatch(/dropSchema\s*:\s*true/);
      expect(config).toMatch(/dropSchema:\s*false/);
      expect(Object.keys(backendPackage.scripts).filter((s) => /migrat|seed/i.test(s))).toEqual([]);
    });

    it('uses Bun for both applications', () => {
      expect(existsSync(join(BACKEND, 'bun.lock'))).toBe(true);
      expect(existsSync(join(FRONTEND, 'bun.lock'))).toBe(true);
      for (const name of ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']) {
        expect(existsSync(join(BACKEND, name))).toBe(false);
        expect(existsSync(join(FRONTEND, name))).toBe(false);
      }
    });
  });

  describe('nothing is put into the database for the user', () => {
    it('has only two start-up hooks: one prepares storage folders, one lists backup files already on disk', () => {
      const withHooks = backendSource
        .filter((f) => /onModuleInit|onApplicationBootstrap/.test(read(f)))
        .map((f) => rel(f))
        .sort();
      expect(withHooks).toEqual(['backend/src/backups/backups.service.ts', 'backend/src/files/storage.service.ts']);
    });

    it('names no default subjects, and has no sample people or marks, in any source file', () => {
      const subjectNames = /['"`](Physics|Arabic|Islamic|Suugaan|Biology|Geography|Mathematics|Chemistry|English|History)['"`]/;
      for (const file of [...backendSource, ...frontendSource]) {
        // An `example:` in a Swagger decorator documents the API; it never reaches the database.
        const lines = read(file).split('\n').filter((line) => !/example\s*:/.test(line));
        expect({ file: rel(file), match: subjectNames.test(lines.join('\n')) }).toEqual({ file: rel(file), match: false });
      }
    });

    it('lets the application be reached only through its own setup wizard for the first account', () => {
      const source = backendSource.map(read).join('\n');
      expect(source).not.toMatch(/Role\.ADMIN|['"]ADMIN['"]/);
      expect(source).not.toMatch(/default(Admin|ClassMaster|Password)/i);
    });
  });

  describe('roles and scope', () => {
    it('has exactly three roles: Class Master, Teacher and Student', () => {
      const body = read(join(BACKEND, 'src', 'common', 'enums', 'role.enum.ts'));
      const values = [...body.matchAll(/^\s*([A-Z_]+)\s*=\s*'([A-Z_]+)'/gm)].map((m) => m[2]);
      expect(values).toEqual(['CLASS_MASTER', 'TEACHER', 'STUDENT']);
    });

    it('has no attendance, lesson-content, parent or monitor feature in the backend or the frontend', () => {
      const names = allFiles.map((f) => rel(f).toLowerCase());
      const feature = /(attendance|lesson|parent|monitor|prefect)/;
      expect(names.filter((n) => feature.test(n) && !n.endsWith('repository.e2e-spec.ts'))).toEqual([]);
    });
  });

  describe('backend structure', () => {
    const src = join(BACKEND, 'src');
    const features = readdirSync(src).filter((n) => statSync(join(src, n)).isDirectory() && !['common', 'config', 'database'].includes(n));

    it('gives every feature its own folder with a module', () => {
      expect(features.length).toBeGreaterThanOrEqual(20);
      for (const feature of features) expect(existsSync(join(src, feature, `${feature}.module.ts`))).toBe(true);
    });

    it('gives every feature that has a controller a service, and every entity a module, in the same folder', () => {
      for (const feature of features) {
        const files = readdirSync(join(src, feature));
        if (files.some((f) => f.endsWith('.controller.ts'))) expect(files).toContain(`${feature}.service.ts`);
        if (files.some((f) => f.endsWith('.entity.ts'))) expect(files).toContain(`${feature}.module.ts`);
      }
    });

    it('keeps every DTO in a dto/ folder inside its feature, and every type file in types/', () => {
      for (const file of backendSource) {
        const parts = rel(file).split('/');
        // common/ holds the few building blocks every feature shares (pagination, enums, decorators).
        if (rel(file).includes('/common/')) continue;
        if (file.endsWith('.dto.ts')) expect({ file: rel(file), folder: parts[parts.length - 2] }).toEqual({ file: rel(file), folder: 'dto' });
        if (/\.(types|interface)\.ts$/.test(file)) {
          expect({ file: rel(file), folder: parts[parts.length - 2] }).toEqual({ file: rel(file), folder: 'types' });
        }
      }
    });

    it('has no global entities/ or dto/ folder', () => {
      const folders = new Set(walk(src).map((f) => relative(src, f).split(sep).slice(0, -1).join('/')));
      for (const folder of folders) {
        expect(folder).not.toMatch(/(^|\/)entities$/);
        if (!folder.includes('/')) expect(folder).not.toBe('dto');
        if (folder.startsWith('common')) expect(folder).not.toMatch(/(^|\/)dto$/);
      }
    });

    it('declares every TypeORM entity in its own <feature>.entity.ts file, and nowhere else', () => {
      const declaring = backendSource.filter((f) => /@Entity\(/.test(read(f)));
      for (const file of declaring) expect(file).toMatch(/\.entity\.ts$/);
      // database/base.entity.ts is the abstract id-and-timestamps base, not a table of its own.
      for (const file of backendSource.filter((f) => f.endsWith('.entity.ts') && !rel(f).includes('/database/'))) {
        expect(read(file).match(/@Entity\(/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
      }
      // A feature may own more than one table (a grading scale and its bands), so count classes, not files.
      const classes = declaring.reduce((total, file) => total + (read(file).match(/@Entity\(/g)?.length ?? 0), 0);
      expect(classes).toBe(19);
    });

    it('registers the global guards so that every route is protected unless marked @Public()', () => {
      const appModule = read(join(src, 'app.module.ts'));
      expect(appModule).toMatch(/APP_GUARD[\s\S]*ThrottlerGuard/);
      expect(appModule).toMatch(/APP_GUARD[\s\S]*JwtAuthGuard/);
      expect(appModule).toMatch(/APP_GUARD[\s\S]*RolesGuard/);
    });
  });

  describe('unfinished work', () => {
    it('has no empty files', () => {
      const empty = allFiles.filter((f) => statSync(f).size === 0 && basename(f) !== '.keep');
      expect(empty.map(rel)).toEqual([]);
    });

    it('has no TODO, FIXME or stub markers in the code', () => {
      const hits = [...backendSource, ...frontendSource].filter((f) => {
        const text = read(f);
        return /(\bTODO\b|\bFIXME\b|\bXXX\b)/.test(text) || /(lorem ipsum|not implemented|coming soon|placeholder implementation)/i.test(text);
      }).map(rel);
      expect(hits).toEqual([]);
    });

    it('has no leftover console.log in the backend or the frontend', () => {
      const hits = [...backendSource, ...frontendSource].filter((f) => /console\.log\(/.test(read(f))).map(rel);
      expect(hits).toEqual([]);
    });
  });

  describe('works offline', () => {
    it('loads nothing from the internet in the frontend: no CDN scripts, styles, fonts or images', () => {
      const files = [join(FRONTEND, 'index.html'), ...walk(join(FRONTEND, 'src')), ...walk(join(FRONTEND, 'public'))].filter(
        (f) => /\.(html|tsx?|css|svg|json)$/.test(f),
      );
      // XML namespaces (SVG, XHTML) are identifiers, not downloads.
      const namespaces = /^https?:\/\/(www\.w3\.org|localhost|127\.0\.0\.1)/;
      const external: string[] = [];
      for (const file of files) {
        for (const match of read(file).matchAll(/https?:\/\/[^\s"'`)<>]+/g)) {
          if (!namespaces.test(match[0]) && !isSpec(file)) external.push(`${rel(file)}: ${match[0]}`);
        }
      }
      expect(external).toEqual([]);
    });

    it('serves its fonts from installed packages, not from Google Fonts or another host', () => {
      const dependencies = Object.keys(frontendPackage.dependencies);
      expect(dependencies).toEqual(expect.arrayContaining(['@fontsource-variable/lexend', '@fontsource/young-serif']));
      const css = [join(FRONTEND, 'index.html'), ...walk(join(FRONTEND, 'src'))].filter((f) => /\.(html|css|tsx?)$/.test(f)).map(read).join('\n');
      expect(css).not.toMatch(/fonts\.(googleapis|gstatic)\.com/);
      expect(css).not.toMatch(/@import\s+url\(/);
    });

    it('makes no outbound network calls from the backend', () => {
      const outbound = /\b(fetch|axios|got|request)\s*\(|https?\.(request|get)\(|net\.connect\(|dns\.(lookup|resolve)|new WebSocket\(/;
      expect(backendSource.filter((f) => outbound.test(read(f))).map(rel)).toEqual([]);
      const names = Object.keys(backendPackage.dependencies);
      expect(names.filter((n) => /^(axios|node-fetch|got|undici|request|superagent|@sentry\/.*|posthog-node|mixpanel)$/.test(n))).toEqual([]);
      const urls = backendSource.flatMap((f) => [...read(f).matchAll(/https?:\/\/[^\s"'`)<>]+/g)].map((m) => `${rel(f)}: ${m[0]}`));
      expect(urls.filter((u) => !/localhost|127\.0\.0\.1|swagger|json-schema/.test(u) && !/\/\*|\* /.test(u))).toEqual([]);
    });

    it('talks to the API only through one relative base path in the frontend', () => {
      const client = frontendSource.filter((f) => /axios\.create\(/.test(read(f)));
      expect(client).toHaveLength(1);
      expect(read(client[0])).toMatch(/baseURL/);
    });
  });

  describe('configuration', () => {
    it('documents every setting the application reads in backend/.env.example', () => {
      const validation = read(join(BACKEND, 'src', 'config', 'environment.validation.ts'));
      const settings = [...validation.matchAll(/^\s{2}([A-Z][A-Z0-9_]+)[!?]?:/gm)].map((m) => m[1]);
      expect(settings.length).toBeGreaterThanOrEqual(15);
      const example = read(join(BACKEND, '.env.example'));
      for (const setting of settings) expect({ setting, documented: new RegExp(`^#?\\s*${setting}=`, 'm').test(example) }).toEqual({ setting, documented: true });
    });

    it('ships a placeholder JWT secret that the application refuses to run with in production', () => {
      expect(read(join(BACKEND, '.env.example'))).toMatch(/^JWT_SECRET=replace_with/m);
      expect(read(join(BACKEND, 'src', 'config', 'environment.validation.ts'))).toMatch(/JWT_SECRET still has the placeholder/);
    });

    it('keeps secrets, dependencies, builds and stored files out of version control', () => {
      const ignore = read(join(ROOT, '.gitignore'));
      for (const entry of ['node_modules/', 'dist/', '.env', 'backend/storage/']) expect(ignore).toContain(entry);
      expect(ignore).toMatch(/!\.env\.example/);
    });

    it('carries no real secrets in the files that would be committed', () => {
      const committed = allFiles.filter((f) => !/(^|\/)\.env$/.test(rel(f)) && !/bun\.lock$/.test(f) && extname(f) !== '.png');
      const secretLike = /(-----BEGIN [A-Z ]*PRIVATE KEY-----|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{30,})/;
      expect(committed.filter((f) => secretLike.test(read(f))).map(rel)).toEqual([]);
    });
  });
});
