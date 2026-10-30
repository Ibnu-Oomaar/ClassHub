import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/types/audit-log.types.interface';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { AppSettings } from './settings.entity';
import { CLASS_NAME, SettingsView } from './types/settings.types.interface';

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(AppSettings) private readonly settings: Repository<AppSettings>,
    private readonly audit: AuditLogsService,
  ) {}

  /** The settings row, or null before the first-run setup has been completed. */
  async find(): Promise<AppSettings | null> {
    const rows = await this.settings.find({ take: 1 });
    return rows[0] ?? null;
  }

  async isSetupCompleted(): Promise<boolean> {
    return (await this.find())?.setupCompleted ?? false;
  }

  async getClassName(): Promise<string> {
    return (await this.find())?.className ?? CLASS_NAME;
  }

  async areSubmissionsEnabled(): Promise<boolean> {
    return (await this.find())?.studentSubmissionsEnabled ?? true;
  }

  async getView(): Promise<SettingsView> {
    const row = await this.find();
    if (!row) {
      return {
        className: CLASS_NAME,
        academicYear: null,
        currentPeriod: null,
        studentSubmissionsEnabled: true,
        setupCompleted: false,
        setupCompletedAt: null,
        updatedAt: null,
      };
    }
    return this.toView(row);
  }

  /** Called once by the setup wizard inside its transaction. */
  async createInitial(manager: EntityManager): Promise<AppSettings> {
    const repository = manager.getRepository(AppSettings);
    return repository.save(
      repository.create({
        singleton: true,
        className: CLASS_NAME,
        setupCompleted: true,
        setupCompletedAt: new Date(),
      }),
    );
  }

  async update(dto: UpdateSettingsDto, actor: AuthenticatedUser): Promise<SettingsView> {
    const row = await this.find();
    if (!row) {
      throw new NotFoundException('The class has not been set up yet.');
    }

    if (dto.academicYear !== undefined) row.academicYear = dto.academicYear;
    if (dto.currentPeriod !== undefined) row.currentPeriod = dto.currentPeriod;
    if (dto.studentSubmissionsEnabled !== undefined) row.studentSubmissionsEnabled = dto.studentSubmissionsEnabled;

    const saved = await this.settings.save(row);

    await this.audit.record({
      actor,
      action: AuditAction.SETTINGS_UPDATED,
      entityType: 'Settings',
      entityId: saved.id,
      summary: 'Updated class settings',
      details: { ...dto },
    });

    return this.toView(saved);
  }

  private toView(row: AppSettings): SettingsView {
    return {
      className: row.className,
      academicYear: row.academicYear,
      currentPeriod: row.currentPeriod,
      studentSubmissionsEnabled: row.studentSubmissionsEnabled,
      setupCompleted: row.setupCompleted,
      setupCompletedAt: row.setupCompletedAt,
      updatedAt: row.updatedAt,
    };
  }
}
