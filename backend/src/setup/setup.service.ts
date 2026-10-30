import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/types/audit-log.types.interface';
import { Role } from '../common/enums/role.enum';
import { AppSettings } from '../settings/settings.entity';
import { SettingsService } from '../settings/settings.service';
import { User } from '../users/users.entity';
import { UsersService } from '../users/users.service';
import { InitialSetupDto } from './dto/initial-setup.dto';
import { SETUP_ADVISORY_LOCK_KEY, SetupResult, SetupStatus } from './types/setup.types.interface';

@Injectable()
export class SetupService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly users: UsersService,
    private readonly settings: SettingsService,
    private readonly audit: AuditLogsService,
  ) {}

  async getStatus(): Promise<SetupStatus> {
    return {
      setupCompleted: await this.isSetupDone(),
      className: await this.settings.getClassName(),
    };
  }

  /**
   * Creates the first Class Master and the class configuration, and nothing else: no students,
   * teachers, subjects or any other records.
   *
   * Concurrency: the whole check-and-create runs in one transaction behind a PostgreSQL advisory
   * lock, so two simultaneous requests cannot both succeed. The second one waits for the lock,
   * then sees the finished setup and is refused.
   */
  async run(dto: InitialSetupDto, ip: string | null): Promise<SetupResult> {
    if (dto.password !== dto.confirmPassword) {
      throw new BadRequestException('The passwords do not match.');
    }

    const created = await this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock($1)', [SETUP_ADVISORY_LOCK_KEY]);

      if (await this.isSetupDone(manager)) {
        throw new ForbiddenException('Setup has already been completed.');
      }

      const classMaster = await this.users.createUser(manager, {
        role: Role.CLASS_MASTER,
        fullName: dto.fullName,
        username: dto.username,
        email: dto.email,
        password: dto.password,
      });
      const settings = await this.settings.createInitial(manager);
      return { classMaster, settings };
    });

    await this.audit.record({
      actor: { id: created.classMaster.id, fullName: created.classMaster.fullName, role: Role.CLASS_MASTER },
      action: AuditAction.SETUP_COMPLETED,
      entityType: 'Settings',
      entityId: created.settings.id,
      summary: `Initial setup completed for ${created.settings.className}`,
      ipAddress: ip,
    });

    return {
      className: created.settings.className,
      classMaster: this.users.toView(created.classMaster),
    };
  }

  /** Setup counts as done if a settings row exists OR any Class Master exists (even soft-deleted). */
  private async isSetupDone(manager = this.dataSource.manager): Promise<boolean> {
    if (await manager.getRepository(AppSettings).exists({ where: { setupCompleted: true } })) {
      return true;
    }
    return manager.getRepository(User).exists({ where: { role: Role.CLASS_MASTER }, withDeleted: true });
  }
}
