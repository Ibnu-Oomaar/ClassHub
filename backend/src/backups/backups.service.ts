import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  ServiceUnavailableException,
  StreamableFile,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { open, readdir, rename, rm, stat } from 'node:fs/promises';
import { DataSource, Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction, AuditActor } from '../audit-logs/types/audit-log.types.interface';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { Paginated, buildPaginated, skipFor } from '../common/pagination/pagination.util';
import { verifyPassword } from '../common/utils/password.util';
import { resolveSort } from '../common/utils/sort.util';
import { AppConfig, loadAppConfig } from '../config/app.config';
import { sanitizeDisplayName } from '../files/file-rules';
import { StorageService } from '../files/storage.service';
import { User } from '../users/users.entity';
import { Backup } from './backups.entity';
import { BackupQueryDto, CreateBackupDto, RestoreBackupDto, UploadBackupDto } from './dto/backup.dto';
import { MaintenanceState } from './maintenance.state';
import { DatabaseTarget, REQUIRED_TABLES, ToolError, connectionArgs, readVersion, runTool, tablesInListing } from './pg-tools';
import { BackupKind, BackupSidecar, BackupStatusView, BackupView, RestoreOutcome } from './types/backup.types.interface';

const DUMP_MAGIC = 'PGDMP';
const STORED_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.dump$/;
const LEFTOVER_AGE_MS = 60 * 60_000;
const SORTABLE = { createdAt: 'b.createdAt', sizeBytes: 'b.sizeBytes', displayName: 'b.displayName', kind: 'b.kind' };

interface Operator {
  id: string | null;
  fullName: string;
  role: Role | null;
}

@Injectable()
export class BackupsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(BackupsService.name);
  private readonly app: AppConfig;
  private readonly database: DatabaseTarget;
  private busy = false;
  private toolCache: { at: number; dump: string | null; restore: string | null } | null = null;

  constructor(
    @InjectRepository(Backup) private readonly backups: Repository<Backup>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly storage: StorageService,
    private readonly audit: AuditLogsService,
    private readonly maintenance: MaintenanceState,
    config: ConfigService,
  ) {
    this.app = loadAppConfig(config);
    this.database = {
      host: config.getOrThrow<string>('DB_HOST'),
      port: config.getOrThrow<number>('DB_PORT'),
      username: config.getOrThrow<string>('DB_USERNAME'),
      password: config.get<string>('DB_PASSWORD') ?? '',
      database: config.getOrThrow<string>('DB_DATABASE'),
    };
  }

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.reconcile();
    } catch (error) {
      this.logger.warn(`Could not check the backups folder: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Reading

  async status(): Promise<BackupStatusView> {
    const tools = await this.tools();
    const totals = await this.backups
      .createQueryBuilder('b')
      .select('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(b.sizeBytes), 0)', 'size')
      .addSelect('MAX(b.createdAt)', 'latest')
      .getRawOne<{ count: string; size: string; latest: Date | null }>();

    return {
      toolsAvailable: tools.problem === null,
      pgDumpVersion: tools.dump,
      pgRestoreVersion: tools.restore,
      toolsProblem: tools.problem,
      busy: this.busy,
      total: parseInt(totals?.count ?? '0', 10),
      totalSizeBytes: parseInt(totals?.size ?? '0', 10),
      latestBackupAt: totals?.latest ? new Date(totals.latest) : null,
    };
  }

  async list(query: BackupQueryDto): Promise<Paginated<BackupView>> {
    const qb = this.backups.createQueryBuilder('b');
    if (query.kind) qb.where('b.kind = :kind', { kind: query.kind });
    if (query.search) {
      qb.andWhere(`(b.displayName ILIKE :search ESCAPE '\\' OR b.note ILIKE :search ESCAPE '\\')`, {
        search: `%${query.search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`,
      });
    }
    qb.orderBy(resolveSort(query.sortBy, SORTABLE, 'createdAt'), query.sortOrder)
      .addOrderBy('b.id', 'ASC')
      .skip(skipFor(query.page, query.limit))
      .take(query.limit);
    const [rows, total] = await qb.getManyAndCount();
    return buildPaginated(await Promise.all(rows.map((row) => this.toView(row))), total, query.page, query.limit);
  }

  async download(id: string): Promise<StreamableFile> {
    const backup = await this.findOrFail(id);
    if (!(await this.storage.exists('backups', backup.fileName))) {
      throw new NotFoundException('The backup file is missing from the backups folder.');
    }
    return new StreamableFile(this.storage.createReadStream('backups', backup.fileName), {
      type: 'application/octet-stream',
      length: backup.sizeBytes,
      disposition: `attachment; filename="${this.safeDownloadName(backup.displayName)}"`,
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Creating

  create(dto: CreateBackupDto, actor: AuthenticatedUser): Promise<BackupView> {
    return this.exclusive(async () => {
      const created = await this.createBackup(BackupKind.MANUAL, dto.note ?? null, this.operator(actor));
      return this.toView(created);
    });
  }

  /** Registers a backup file the Class Master uploaded. `tempPath` is the multer file; it is always cleaned up. */
  upload(tempPath: string | undefined, originalName: string | undefined, dto: UploadBackupDto, actor: AuthenticatedUser): Promise<BackupView> {
    if (!tempPath) {
      throw new BadRequestException('Choose a backup file to upload.');
    }
    const temporary = tempPath;
    return this.exclusive(async () => {
      try {
        await this.assertTools();
        await this.assertDumpMagic(temporary);
        await this.assertClasshubArchive(temporary);

        const fileName = `${randomUUID()}.dump`;
        await rename(temporary, this.storage.resolveSafe('backups', fileName));
        const finalPath = this.storage.resolveSafe('backups', fileName);
        const operator = this.operator(actor);
        const backup = await this.register({
          fileName,
          displayName: sanitizeDisplayName(originalName ?? '') === 'file' ? this.generatedName('classhub-uploaded') : sanitizeDisplayName(originalName ?? ''),
          kind: BackupKind.UPLOADED,
          note: dto.note ?? null,
          path: finalPath,
          operator,
        });
        await this.audit.record({
          actor: operator,
          action: AuditAction.BACKUP_UPLOADED,
          entityType: 'Backup',
          entityId: backup.id,
          summary: `Uploaded backup "${backup.displayName}"`,
          details: { sizeBytes: backup.sizeBytes },
        });
        return this.toView(backup);
      } finally {
        await rm(temporary, { force: true });
      }
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Restoring

  /**
   * Replaces ALL current data with the backup. Order of events:
   * password check -> integrity check -> automatic safety backup -> restore in ONE transaction
   * (any error rolls everything back and leaves the data as it was) -> schema sync -> audit.
   */
  async restore(id: string, dto: RestoreBackupDto, actor: AuthenticatedUser): Promise<RestoreOutcome> {
    await this.assertPassword(actor, dto.password);
    const backup = await this.findOrFail(id);

    return this.exclusive(async () => {
      await this.assertTools();
      const path = this.storage.resolveSafe('backups', backup.fileName);
      if (!(await this.storage.exists('backups', backup.fileName))) {
        throw new NotFoundException('The backup file is missing from the backups folder.');
      }
      if ((await this.checksum(path)) !== backup.checksumSha256) {
        throw new ConflictException('The backup file has changed since it was created and cannot be trusted. Restore was not started.');
      }
      await this.assertClasshubArchive(path);

      const operator = this.operator(actor);
      const safety = await this.createBackup(
        BackupKind.PRE_RESTORE,
        `Automatic safety copy before restoring "${backup.displayName}"`,
        operator,
      );

      this.maintenance.begin();
      try {
        await runTool(
          this.app.pgRestorePath,
          [
            '--clean',
            '--if-exists',
            '--no-owner',
            '--no-privileges',
            '--single-transaction',
            '--exit-on-error',
            ...connectionArgs(this.database),
            path,
          ],
          { password: this.database.password, pgOptions: '-c lock_timeout=60000' },
        );
      } catch (error) {
        this.maintenance.end();
        const reason = error instanceof ToolError ? error.message : String(error);
        this.logger.error(`Restore of ${backup.displayName} failed: ${reason}`);
        await this.audit.record({
          actor: operator,
          action: AuditAction.BACKUP_FAILED,
          entityType: 'Backup',
          entityId: backup.id,
          summary: `Restore of "${backup.displayName}" failed and was rolled back`,
          details: { reason: reason.slice(0, 300) },
        });
        throw new BadGatewayException(`The restore failed and was rolled back, so your data is unchanged. Reason: ${reason}`);
      }

      const warnings: string[] = [];
      try {
        // A backup from an older version may lack newer columns: bring the structure up to date.
        await this.dataSource.synchronize();
      } catch (error) {
        warnings.push(`The database structure could not be updated automatically (${error instanceof Error ? error.message : String(error)}). Restart the server and check the log.`);
      } finally {
        this.maintenance.end();
      }

      await this.reconcile();

      // The signed-in account may not exist in the restored data (a backup from another installation).
      const stillExists = await this.users.exists({ where: { id: actor.id }, withDeleted: true });
      await this.audit.record({
        actor: { ...operator, id: stillExists ? operator.id : null },
        action: AuditAction.BACKUP_RESTORED,
        entityType: 'Backup',
        entityId: backup.id,
        summary: `Restored backup "${backup.displayName}" (taken ${backup.createdAt.toISOString().slice(0, 16).replace('T', ' ')} UTC)`,
        details: { safetyBackup: safety.displayName },
      });
      if (!stillExists) {
        warnings.push('Your account does not exist in the restored data. You will be signed out: sign in with an account from the backup.');
      }
      warnings.push('Backups contain the database only. Uploaded files (photos, assignment files) are not part of it.');

      return { restoredFrom: await this.toView(backup), safetyBackup: await this.toView(safety), warnings };
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Deleting

  remove(id: string, actor: AuthenticatedUser): Promise<{ id: string }> {
    return this.exclusive(async () => {
      const backup = await this.findOrFail(id);
      await this.backups.delete({ id });
      await this.storage.delete('backups', backup.fileName);
      await this.storage.delete('backups', `${backup.fileName}.json`);
      await this.audit.record({
        actor: this.operator(actor),
        action: AuditAction.BACKUP_DELETED,
        entityType: 'Backup',
        entityId: id,
        summary: `Deleted backup "${backup.displayName}"`,
      });
      return { id };
    });
  }

  // ---------------------------------------------------------------------------------------------
  // Keeping the folder and the catalogue in step

  /**
   * Re-registers backup files that have a description file but no database row (for example after
   * the database was recreated) and removes half-written leftovers of crashed runs.
   */
  async reconcile(): Promise<void> {
    const directory = this.storage.directoryFor('backups');
    const names = await readdir(directory).catch(() => [] as string[]);
    const known = new Set((await this.backups.find({ select: { fileName: true } })).map((row) => row.fileName));

    for (const name of names) {
      const path = `${directory}/${name}`;
      if (/\.(partial|upload)$/.test(name)) {
        const age = Date.now() - (await stat(path).then((s) => s.mtimeMs).catch(() => Date.now()));
        if (age > LEFTOVER_AGE_MS) await rm(path, { force: true });
        continue;
      }
      if (!STORED_NAME.test(name) || known.has(name)) continue;

      const sidecar = await this.readSidecar(name);
      if (!sidecar) continue; // a file we did not create: leave it alone
      const size = await stat(path).then((s) => s.size).catch(() => null);
      if (size === null || size !== sidecar.sizeBytes) continue;

      await this.backups.insert({
        fileName: name,
        displayName: sidecar.displayName,
        kind: sidecar.kind,
        note: sidecar.note,
        sizeBytes: sidecar.sizeBytes,
        checksumSha256: sidecar.checksumSha256,
        createdById: null,
        createdByName: sidecar.createdByName,
        createdAt: new Date(sidecar.createdAt),
      } as QueryDeepPartialEntity<Backup>);
      this.logger.log(`Re-registered backup "${sidecar.displayName}" found in the backups folder.`);
    }
  }

  // ---------------------------------------------------------------------------------------------
  // Internals

  private async createBackup(kind: BackupKind, note: string | null, operator: Operator): Promise<Backup> {
    await this.assertTools();
    const fileName = `${randomUUID()}.dump`;
    const finalPath = this.storage.resolveSafe('backups', fileName);
    const partialPath = this.storage.resolveSafe('backups', `${fileName}.partial`);

    try {
      await runTool(
        this.app.pgDumpPath,
        [
          '--format=custom',
          '--no-owner',
          '--no-privileges',
          // The catalogue of backups is not part of a backup (see backups.entity.ts).
          '--exclude-table=backups',
          '--file',
          partialPath,
          ...connectionArgs(this.database),
        ],
        { password: this.database.password },
      );
      await this.assertClasshubArchive(partialPath);
      await rename(partialPath, finalPath);
    } catch (error) {
      await rm(partialPath, { force: true });
      const reason = error instanceof ToolError || error instanceof BadRequestException ? error.message : String(error);
      await this.audit.record({
        actor: operator,
        action: AuditAction.BACKUP_FAILED,
        entityType: 'Backup',
        summary: 'Creating a backup failed',
        details: { reason: reason.slice(0, 300) },
      });
      if (error instanceof ServiceUnavailableException) throw error;
      throw new InternalServerErrorException(`The backup could not be created. ${reason}`);
    }

    const backup = await this.register({
      fileName,
      displayName: this.generatedName(kind === BackupKind.PRE_RESTORE ? 'classhub-before-restore' : 'classhub-backup'),
      kind,
      note,
      path: finalPath,
      operator,
    });
    await this.audit.record({
      actor: operator,
      action: AuditAction.BACKUP_CREATED,
      entityType: 'Backup',
      entityId: backup.id,
      summary: `Created ${kind === BackupKind.PRE_RESTORE ? 'safety ' : ''}backup "${backup.displayName}"`,
      details: { sizeBytes: backup.sizeBytes },
    });
    return backup;
  }

  /** Stores the catalogue row and the description file next to the backup. */
  private async register(input: { fileName: string; displayName: string; kind: BackupKind; note: string | null; path: string; operator: Operator }): Promise<Backup> {
    const { size } = await stat(input.path);
    const checksum = await this.checksum(input.path);
    const backup = await this.backups.save(
      this.backups.create({
        fileName: input.fileName,
        displayName: input.displayName,
        kind: input.kind,
        note: input.note,
        sizeBytes: size,
        checksumSha256: checksum,
        createdById: input.operator.id,
        createdByName: input.operator.fullName,
      }),
    );
    const sidecar: BackupSidecar = {
      displayName: backup.displayName,
      kind: backup.kind,
      note: backup.note,
      sizeBytes: backup.sizeBytes,
      checksumSha256: backup.checksumSha256,
      createdByName: backup.createdByName,
      createdAt: backup.createdAt.toISOString(),
    };
    await this.storage.write('backups', `${input.fileName}.json`, Buffer.from(JSON.stringify(sidecar, null, 2), 'utf8'));
    return backup;
  }

  private async readSidecar(fileName: string): Promise<BackupSidecar | null> {
    try {
      const handle = await open(this.storage.resolveSafe('backups', `${fileName}.json`), 'r');
      try {
        const parsed = JSON.parse(await handle.readFile({ encoding: 'utf8' })) as Partial<BackupSidecar>;
        const valid =
          typeof parsed.displayName === 'string' &&
          Object.values(BackupKind).includes(parsed.kind as BackupKind) &&
          typeof parsed.sizeBytes === 'number' &&
          typeof parsed.checksumSha256 === 'string' &&
          typeof parsed.createdByName === 'string' &&
          typeof parsed.createdAt === 'string' &&
          !Number.isNaN(Date.parse(parsed.createdAt));
        return valid ? { ...(parsed as BackupSidecar), note: typeof parsed.note === 'string' ? parsed.note : null } : null;
      } finally {
        await handle.close();
      }
    } catch {
      return null;
    }
  }

  private async findOrFail(id: string): Promise<Backup> {
    const backup = await this.backups.findOne({ where: { id } });
    if (!backup) {
      throw new NotFoundException('Backup not found.');
    }
    return backup;
  }

  private async toView(backup: Backup): Promise<BackupView> {
    return {
      id: backup.id,
      displayName: backup.displayName,
      kind: backup.kind,
      note: backup.note,
      sizeBytes: backup.sizeBytes,
      checksumSha256: backup.checksumSha256,
      createdByName: backup.createdByName,
      createdAt: backup.createdAt,
      fileExists: await this.storage.exists('backups', backup.fileName),
    };
  }

  private operator(actor: AuthenticatedUser): Operator {
    return { id: actor.id, fullName: actor.fullName, role: actor.role };
  }

  private async exclusive<T>(work: () => Promise<T>): Promise<T> {
    if (this.busy) {
      throw new ConflictException('Another backup operation is already running. Wait for it to finish.');
    }
    this.busy = true;
    try {
      return await work();
    } finally {
      this.busy = false;
    }
  }

  private async assertPassword(actor: AuthenticatedUser, password: string): Promise<void> {
    const user = await this.users.createQueryBuilder('user').addSelect('user.passwordHash').where('user.id = :id', { id: actor.id }).getOne();
    const ok = !!user?.passwordHash && (await verifyPassword(user.passwordHash, password));
    if (!ok) {
      await this.audit.record({
        actor: this.operator(actor) satisfies AuditActor,
        action: AuditAction.BACKUP_FAILED,
        entityType: 'Backup',
        summary: 'A restore was refused: wrong password',
      });
      throw new ForbiddenException('The password is not correct.');
    }
  }

  /** Both tools must run. The result is cached briefly so listing backups stays cheap. */
  private async tools(): Promise<{ dump: string | null; restore: string | null; problem: string | null }> {
    if (!this.toolCache || Date.now() - this.toolCache.at > 30_000) {
      const [dump, restore] = await Promise.all([readVersion(this.app.pgDumpPath), readVersion(this.app.pgRestorePath)]);
      this.toolCache = { at: Date.now(), dump, restore };
    }
    const { dump, restore } = this.toolCache;
    const missing = [dump ? null : 'pg_dump', restore ? null : 'pg_restore'].filter(Boolean);
    return {
      dump,
      restore,
      problem:
        missing.length === 0
          ? null
          : `${missing.join(' and ')} could not be found. Install the PostgreSQL client tools, or set PG_DUMP_PATH / PG_RESTORE_PATH in backend/.env to their full paths.`,
    };
  }

  private async assertTools(): Promise<void> {
    const { problem } = await this.tools();
    if (problem) {
      throw new ServiceUnavailableException(problem);
    }
  }

  private async assertDumpMagic(path: string): Promise<void> {
    const handle = await open(path, 'r');
    try {
      const { bytesRead, buffer } = await handle.read(Buffer.alloc(DUMP_MAGIC.length), 0, DUMP_MAGIC.length, 0);
      if (bytesRead < DUMP_MAGIC.length || buffer.toString('latin1') !== DUMP_MAGIC) {
        throw new BadRequestException('This is not a PostgreSQL backup file. Upload a .dump file created by CLASSHUB.');
      }
    } finally {
      await handle.close();
    }
  }

  /** The file must be readable by this installation's pg_restore and contain the CLASSHUB tables. */
  private async assertClasshubArchive(path: string): Promise<void> {
    let listing: string;
    try {
      listing = (await runTool(this.app.pgRestorePath, ['--list', path], { timeoutMs: 120_000 })).stdout;
    } catch (error) {
      if (error instanceof ToolError && error.notFound) {
        throw new ServiceUnavailableException('pg_restore could not be started. Check PG_RESTORE_PATH in backend/.env.');
      }
      throw new BadRequestException(
        `This file cannot be read as a PostgreSQL backup. It may be damaged, or made by a newer PostgreSQL than the one installed here. (${error instanceof ToolError ? error.message : String(error)})`,
      );
    }
    const tables = tablesInListing(listing);
    const missing = REQUIRED_TABLES.filter((table) => !tables.has(table));
    if (missing.length > 0) {
      throw new BadRequestException('This file is a PostgreSQL backup, but not a CLASSHUB backup (core tables are missing).');
    }
  }

  private async checksum(path: string): Promise<string> {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
    return hash.digest('hex');
  }

  private generatedName(prefix: string): string {
    const stamp = new Date().toISOString().slice(0, 19).replace('T', '_').replace(/:/g, '-');
    return `${prefix}-${stamp}.dump`;
  }

  private safeDownloadName(displayName: string): string {
    const cleaned = displayName.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
    return cleaned || 'classhub-backup.dump';
  }
}
