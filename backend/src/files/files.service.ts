import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  StreamableFile,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomUUID } from 'node:crypto';
import { EntityManager, Repository } from 'typeorm';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/types/audit-log.types.interface';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { Paginated, buildPaginated, skipFor } from '../common/pagination/pagination.util';
import { escapeLike, resolveSort } from '../common/utils/sort.util';
import { loadAppConfig } from '../config/app.config';
import { FileQueryDto } from './dto/file-query.dto';
import { CATEGORY_RULES, detectFileType, repairFilenameEncoding, sanitizeDisplayName } from './file-rules';
import { FileRecord } from './files.entity';
import { StorageService } from './storage.service';
import { FileCategory, FileOwnerType, FileView } from './types/file.types.interface';

const SORTABLE = {
  createdAt: 'file.createdAt',
  originalName: 'file.originalName',
  sizeBytes: 'file.sizeBytes',
  category: 'file.category',
};

export interface GeneratedFileInput {
  buffer: Buffer;
  originalName: string;
  category: FileCategory;
  mimeType: string;
  uploadedById: string | null;
}

@Injectable()
export class FilesService {
  private readonly maxUploadBytes: number;

  constructor(
    @InjectRepository(FileRecord) private readonly files: Repository<FileRecord>,
    private readonly storage: StorageService,
    private readonly audit: AuditLogsService,
    config: ConfigService,
  ) {
    this.maxUploadBytes = loadAppConfig(config).maxUploadBytes;
  }

  /** Validates and stores an uploaded file. The result is not attached to anything yet. */
  async upload(file: Express.Multer.File | undefined, category: FileCategory, user: AuthenticatedUser): Promise<FileView> {
    const rule = CATEGORY_RULES[category];

    if (!rule.uploadRoles.includes(user.role)) {
      throw new ForbiddenException(`Your role cannot upload a ${rule.label}.`);
    }
    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new BadRequestException('Choose a file to upload.');
    }

    const limit = Math.min(this.maxUploadBytes, rule.maxBytes ?? Number.POSITIVE_INFINITY);
    if (file.size > limit) {
      throw new PayloadTooLargeException(`The file is larger than the ${Math.floor(limit / (1024 * 1024))} MB limit.`);
    }

    const originalName = sanitizeDisplayName(repairFilenameEncoding(file.originalname));
    const detected = detectFileType(originalName, file.buffer);
    if (!detected || !rule.allowedMimeTypes.includes(detected.mimeType)) {
      throw new BadRequestException(`This file type is not allowed. Upload a ${rule.label}.`);
    }

    const storedName = `${randomUUID()}${detected.extension}`;
    await this.storage.write(rule.directory, storedName, file.buffer);

    try {
      const record = await this.files.save(
        this.files.create({
          category,
          originalName,
          storedName,
          mimeType: detected.mimeType,
          sizeBytes: file.size,
          checksumSha256: createHash('sha256').update(file.buffer).digest('hex'),
          uploadedById: user.id,
          ownerType: null,
          ownerId: null,
        }),
      );

      await this.audit.record({
        actor: user,
        action: AuditAction.FILE_UPLOADED,
        entityType: 'File',
        entityId: record.id,
        summary: `Uploaded ${originalName}`,
        details: { category, sizeBytes: file.size },
      });

      return this.toView(record);
    } catch (error) {
      await this.storage.delete(rule.directory, storedName);
      throw error;
    }
  }

  /** Stores a file produced by the server itself (PDF/CSV reports). */
  async saveGenerated(input: GeneratedFileInput): Promise<FileRecord> {
    const rule = CATEGORY_RULES[input.category];
    const extension = input.mimeType === 'application/pdf' ? '.pdf' : '.csv';
    const storedName = `${randomUUID()}${extension}`;

    await this.storage.write(rule.directory, storedName, input.buffer);
    try {
      return await this.files.save(
        this.files.create({
          category: input.category,
          originalName: sanitizeDisplayName(input.originalName),
          storedName,
          mimeType: input.mimeType,
          sizeBytes: input.buffer.length,
          checksumSha256: createHash('sha256').update(input.buffer).digest('hex'),
          uploadedById: input.uploadedById,
          ownerType: null,
          ownerId: null,
        }),
      );
    } catch (error) {
      await this.storage.delete(rule.directory, storedName);
      throw error;
    }
  }

  async getRecord(id: string, manager?: EntityManager): Promise<FileRecord> {
    const repository = manager ? manager.getRepository(FileRecord) : this.files;
    const record = await repository.findOne({ where: { id } });
    if (!record) {
      throw new NotFoundException('File not found.');
    }
    return record;
  }

  /**
   * Checks that an uploaded file can be linked to a new record by this user: it must exist,
   * be of the expected category, have been uploaded by them, and not be attached already.
   */
  async assertLinkableUpload(
    fileId: string,
    user: AuthenticatedUser,
    category: FileCategory,
    manager?: EntityManager,
  ): Promise<FileRecord> {
    const record = await this.getRecord(fileId, manager);
    if (record.category !== category || record.uploadedById !== user.id) {
      throw new BadRequestException('That file cannot be used here. Upload it again.');
    }
    if (record.ownerId !== null) {
      throw new ConflictException('That file is already attached to another record.');
    }
    return record;
  }

  async attach(fileId: string, ownerType: FileOwnerType, ownerId: string, manager?: EntityManager): Promise<void> {
    const repository = manager ? manager.getRepository(FileRecord) : this.files;
    await repository.update({ id: fileId }, { ownerType, ownerId });
  }

  /** Streams a stored file. Callers MUST have authorized the request before calling this. */
  async stream(record: FileRecord, options: { inline?: boolean } = {}): Promise<StreamableFile> {
    const directory = CATEGORY_RULES[record.category].directory;
    if (!(await this.storage.exists(directory, record.storedName))) {
      throw new NotFoundException('The stored file is missing from disk.');
    }
    return new StreamableFile(this.storage.createReadStream(directory, record.storedName), {
      type: record.mimeType,
      length: record.sizeBytes,
      disposition: this.contentDisposition(record.originalName, options.inline ?? false),
    });
  }

  /** Deletes a file's record and its bytes. Used when the owning record drops the file. */
  async discard(fileId: string, manager?: EntityManager): Promise<void> {
    const repository = manager ? manager.getRepository(FileRecord) : this.files;
    const record = await repository.findOne({ where: { id: fileId } });
    if (!record) return;
    await repository.delete({ id: fileId });
    await this.storage.delete(CATEGORY_RULES[record.category].directory, record.storedName);
  }

  async findAll(query: FileQueryDto): Promise<Paginated<FileView>> {
    const qb = this.files.createQueryBuilder('file');

    if (query.category) qb.andWhere('file.category = :category', { category: query.category });
    if (query.unattachedOnly) qb.andWhere('file.ownerId IS NULL');
    if (query.search) {
      qb.andWhere(`file.originalName ILIKE :search ESCAPE '\\'`, { search: `%${escapeLike(query.search)}%` });
    }

    qb.orderBy(resolveSort(query.sortBy, SORTABLE, 'createdAt'), query.sortOrder)
      .addOrderBy('file.id', 'ASC')
      .skip(skipFor(query.page, query.limit))
      .take(query.limit);

    const [rows, total] = await qb.getManyAndCount();
    return buildPaginated(rows.map((row) => this.toView(row)), total, query.page, query.limit);
  }

  async findOneView(id: string): Promise<FileView> {
    return this.toView(await this.getRecord(id));
  }

  /** Class Master clean-up. Files that belong to a record must be removed from that record. */
  async removeStandalone(id: string, actor: AuthenticatedUser): Promise<void> {
    const record = await this.getRecord(id);
    if (record.ownerId !== null) {
      throw new ConflictException('This file is attached to a record. Remove it from that record instead.');
    }
    await this.discard(id);
    await this.audit.record({
      actor,
      action: AuditAction.FILE_DELETED,
      entityType: 'File',
      entityId: id,
      summary: `Deleted ${record.originalName}`,
      details: { category: record.category },
    });
  }

  toView(record: FileRecord): FileView {
    return {
      id: record.id,
      category: record.category,
      originalName: record.originalName,
      mimeType: record.mimeType,
      sizeBytes: record.sizeBytes,
      attached: record.ownerId !== null,
      uploadedById: record.uploadedById,
      createdAt: record.createdAt,
    };
  }

  private contentDisposition(name: string, inline: boolean): string {
    const type = inline ? 'inline' : 'attachment';
    const asciiFallback = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    return `${type}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
  }
}
