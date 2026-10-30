import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/types/audit-log.types.interface';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { Paginated, buildPaginated, skipFor } from '../common/pagination/pagination.util';
import { escapeLike, resolveSort } from '../common/utils/sort.util';
import { Announcement } from './announcements.entity';
import { AnnouncementQueryDto, AnnouncementStateFilter } from './dto/announcement-query.dto';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { AnnouncementAudience, AnnouncementState, AnnouncementView } from './types/announcement.types.interface';

const SORTABLE = {
  createdAt: 'a.createdAt',
  publishedAt: 'a.publishedAt',
  title: 'a.title',
  audience: 'a.audience',
};

@Injectable()
export class AnnouncementsService {
  constructor(
    @InjectRepository(Announcement) private readonly announcements: Repository<Announcement>,
    private readonly audit: AuditLogsService,
  ) {}

  async create(dto: CreateAnnouncementDto, actor: AuthenticatedUser): Promise<AnnouncementView> {
    const now = new Date();
    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (expiresAt && expiresAt.getTime() <= now.getTime()) {
      throw new BadRequestException('The expiry must be in the future.');
    }
    const isPublished = dto.isPublished ?? true;

    const saved = await this.announcements.save(
      this.announcements.create({
        title: dto.title,
        body: dto.body,
        audience: dto.audience ?? AnnouncementAudience.ALL,
        isPinned: dto.isPinned ?? false,
        isPublished,
        publishedAt: isPublished ? now : null,
        expiresAt,
        createdById: actor.id,
      }),
    );

    await this.audit.record({
      actor,
      action: AuditAction.ANNOUNCEMENT_CREATED,
      entityType: 'Announcement',
      entityId: saved.id,
      summary: `${isPublished ? 'Published' : 'Saved draft'}: "${saved.title}" for ${saved.audience}`,
    });

    return this.findOne(saved.id, actor);
  }

  async update(id: string, dto: UpdateAnnouncementDto, actor: AuthenticatedUser): Promise<AnnouncementView> {
    const existing = await this.announcements.findOne({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Announcement not found.');
    }

    const now = new Date();
    const isPublished = dto.isPublished ?? existing.isPublished;
    const expiresAt = dto.expiresAt === undefined ? existing.expiresAt : dto.expiresAt === null ? null : new Date(dto.expiresAt);
    let publishedAt = existing.publishedAt;
    if (isPublished && !existing.isPublished) publishedAt = now;
    if (!isPublished) publishedAt = null;

    if (expiresAt && publishedAt && expiresAt.getTime() <= publishedAt.getTime()) {
      throw new BadRequestException(
        existing.isPublished
          ? 'The expiry must be after the publish time.'
          : 'The expiry is already in the past. Extend or clear it before publishing.',
      );
    }

    const changes: Partial<Announcement> = {
      title: dto.title ?? existing.title,
      body: dto.body ?? existing.body,
      audience: dto.audience ?? existing.audience,
      isPinned: dto.isPinned ?? existing.isPinned,
      isPublished,
      publishedAt,
      expiresAt,
    };
    await this.announcements.update({ id }, changes);

    await this.audit.record({
      actor,
      action: AuditAction.ANNOUNCEMENT_UPDATED,
      entityType: 'Announcement',
      entityId: id,
      summary: `Updated announcement "${changes.title}"`,
      details: {
        publishedChanged: isPublished !== existing.isPublished ? isPublished : undefined,
        audience: changes.audience !== existing.audience ? changes.audience : undefined,
        pinned: changes.isPinned !== existing.isPinned ? changes.isPinned : undefined,
      },
    });

    return this.findOne(id, actor);
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<{ id: string }> {
    const existing = await this.announcements.findOne({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Announcement not found.');
    }
    await this.announcements.softDelete({ id });
    await this.audit.record({
      actor,
      action: AuditAction.ANNOUNCEMENT_DELETED,
      entityType: 'Announcement',
      entityId: id,
      summary: `Deleted announcement "${existing.title}"`,
    });
    return { id };
  }

  /** Class Master: everything (with filters). Teachers and students: only live announcements meant for them. */
  async list(query: AnnouncementQueryDto, actor: AuthenticatedUser): Promise<Paginated<AnnouncementView>> {
    const qb = this.baseQuery();
    this.applyVisibility(qb, actor);

    if (actor.role === Role.CLASS_MASTER && query.state) {
      this.applyStateFilter(qb, query.state);
    }
    if (query.audience) qb.andWhere('a.audience = :audience', { audience: query.audience });
    if (query.isPinned !== undefined) qb.andWhere('a.isPinned = :isPinned', { isPinned: query.isPinned });
    if (query.search) {
      qb.andWhere(`(a.title ILIKE :search ESCAPE '\\' OR a.body ILIKE :search ESCAPE '\\')`, { search: `%${escapeLike(query.search)}%` });
    }

    qb.orderBy('a.isPinned', 'DESC')
      .addOrderBy(resolveSort(query.sortBy, SORTABLE, 'createdAt'), query.sortOrder)
      .addOrderBy('a.id', 'ASC')
      .skip(skipFor(query.page, query.limit))
      .take(query.limit);

    const [rows, total] = await qb.getManyAndCount();
    return buildPaginated(rows.map((row) => this.toView(row)), total, query.page, query.limit);
  }

  async findOne(id: string, actor: AuthenticatedUser): Promise<AnnouncementView> {
    const qb = this.baseQuery().where('a.id = :id', { id });
    this.applyVisibility(qb, actor, true);
    const row = await qb.getOne();
    if (!row) {
      throw new NotFoundException('Announcement not found.');
    }
    return this.toView(row);
  }

  private baseQuery(): SelectQueryBuilder<Announcement> {
    return this.announcements.createQueryBuilder('a').leftJoinAndSelect('a.createdBy', 'author');
  }

  /** Teachers and students only ever see published, unexpired announcements addressed to them. */
  private applyVisibility(qb: SelectQueryBuilder<Announcement>, actor: AuthenticatedUser, hasWhere = false): void {
    if (actor.role === Role.CLASS_MASTER) {
      if (!hasWhere) qb.where('1 = 1');
      return;
    }
    const audience = actor.role === Role.TEACHER ? AnnouncementAudience.TEACHERS : AnnouncementAudience.STUDENTS;
    const condition = `a.isPublished = true AND (a.expiresAt IS NULL OR a.expiresAt > now()) AND a.audience IN (:...audiences)`;
    const parameters = { audiences: [AnnouncementAudience.ALL, audience] };
    if (hasWhere) qb.andWhere(condition, parameters);
    else qb.where(condition, parameters);
  }

  private applyStateFilter(qb: SelectQueryBuilder<Announcement>, state: AnnouncementStateFilter): void {
    if (state === AnnouncementStateFilter.DRAFT) {
      qb.andWhere('a.isPublished = false');
    } else if (state === AnnouncementStateFilter.EXPIRED) {
      qb.andWhere('a.isPublished = true AND a.expiresAt IS NOT NULL AND a.expiresAt <= now()');
    } else {
      qb.andWhere('a.isPublished = true AND (a.expiresAt IS NULL OR a.expiresAt > now())');
    }
  }

  private toView(row: Announcement): AnnouncementView {
    const state: AnnouncementState = !row.isPublished
      ? 'DRAFT'
      : row.expiresAt && row.expiresAt.getTime() <= Date.now()
        ? 'EXPIRED'
        : 'ACTIVE';
    return {
      id: row.id,
      title: row.title,
      body: row.body,
      audience: row.audience,
      isPinned: row.isPinned,
      isPublished: row.isPublished,
      state,
      publishedAt: row.publishedAt,
      expiresAt: row.expiresAt,
      authorName: row.createdBy?.fullName ?? 'Class Master',
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
