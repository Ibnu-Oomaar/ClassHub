import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { Paginated, buildPaginated, skipFor } from '../common/pagination/pagination.util';
import { escapeLike, resolveSort } from '../common/utils/sort.util';
import { AuditLog } from './audit-logs.entity';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { AuditEvent, AuditLogView } from './types/audit-log.types.interface';

const SORTABLE = {
  createdAt: 'log.createdAt',
  action: 'log.action',
  entityType: 'log.entityType',
  actorName: 'log.actorName',
};

@Injectable()
export class AuditLogsService {
  private readonly logger = new Logger(AuditLogsService.name);

  constructor(@InjectRepository(AuditLog) private readonly logs: Repository<AuditLog>) {}

  /**
   * Records an event. Auditing must never break the action being audited, so a failure to
   * write the log is reported to the server log and swallowed.
   */
  async record(event: AuditEvent): Promise<void> {
    try {
      const row: QueryDeepPartialEntity<AuditLog> = {
        actorId: event.actor?.id ?? null,
        actorName: event.actor?.fullName ?? 'System',
        actorRole: event.actor?.role ?? null,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId ?? null,
        summary: event.summary.slice(0, 255),
        // jsonb column: the driver serializes the object; the partial-entity type cannot express that.
        details: (event.details ?? null) as never,
        ipAddress: event.ipAddress ?? null,
      };
      await this.logs.insert(row);
    } catch (error) {
      this.logger.error(`Could not write audit log "${event.action}"`, error instanceof Error ? error.stack : String(error));
    }
  }

  async findAll(query: AuditLogQueryDto): Promise<Paginated<AuditLogView>> {
    const qb = this.logs.createQueryBuilder('log');

    if (query.action) qb.andWhere('log.action = :action', { action: query.action });
    if (query.entityType) qb.andWhere('log.entityType = :entityType', { entityType: query.entityType });
    if (query.actorId) qb.andWhere('log.actorId = :actorId', { actorId: query.actorId });
    if (query.from) qb.andWhere('log.createdAt >= :from', { from: new Date(query.from) });
    if (query.to) {
      const end = new Date(query.to);
      end.setUTCHours(23, 59, 59, 999);
      qb.andWhere('log.createdAt <= :to', { to: end });
    }
    if (query.search) {
      qb.andWhere(`(log.summary ILIKE :search ESCAPE '\\' OR log.actorName ILIKE :search ESCAPE '\\')`, {
        search: `%${escapeLike(query.search)}%`,
      });
    }

    qb.orderBy(resolveSort(query.sortBy, SORTABLE, 'createdAt'), query.sortOrder)
      .addOrderBy('log.id', 'ASC')
      .skip(skipFor(query.page, query.limit))
      .take(query.limit);

    const [rows, total] = await qb.getManyAndCount();
    return buildPaginated(rows.map((row) => this.toView(row)), total, query.page, query.limit);
  }

  /** Latest activity for dashboards. Optionally limited to what one user did. */
  async recent(limit: number, actorId?: string): Promise<AuditLogView[]> {
    const qb = this.logs.createQueryBuilder('log').orderBy('log.createdAt', 'DESC').take(limit);
    if (actorId) qb.where('log.actorId = :actorId', { actorId });
    const rows = await qb.getMany();
    return rows.map((row) => this.toView(row));
  }

  private toView(row: AuditLog): AuditLogView {
    return {
      id: row.id,
      createdAt: row.createdAt,
      actorId: row.actorId,
      actorName: row.actorName,
      actorRole: row.actorRole,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      summary: row.summary,
      details: row.details,
      ipAddress: row.ipAddress,
    };
  }
}
