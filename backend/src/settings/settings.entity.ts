import { Check, Column, Entity } from 'typeorm';
import { AppBaseEntity } from '../database/base.entity';
import { CLASS_NAME } from './types/settings.types.interface';

/**
 * Class configuration and application settings in one row. The `singleton` column is unique and
 * constrained to `true`, so the database itself guarantees there is never more than one row.
 * The row is created by the first-run setup wizard - never by seeding.
 */
@Entity('app_settings')
@Check('chk_app_settings_singleton', '"singleton" = true')
export class AppSettings extends AppBaseEntity {
  @Column({ type: 'boolean', default: true, unique: true })
  singleton: boolean;

  @Column({ type: 'varchar', length: 120, name: 'class_name', default: CLASS_NAME })
  className: string;

  @Column({ type: 'varchar', length: 40, name: 'academic_year', nullable: true })
  academicYear: string | null;

  @Column({ type: 'varchar', length: 60, name: 'current_period', nullable: true })
  currentPeriod: string | null;

  @Column({ type: 'boolean', name: 'student_submissions_enabled', default: true })
  studentSubmissionsEnabled: boolean;

  @Column({ type: 'boolean', name: 'setup_completed', default: false })
  setupCompleted: boolean;

  @Column({ type: 'timestamptz', name: 'setup_completed_at', nullable: true })
  setupCompletedAt: Date | null;
}
