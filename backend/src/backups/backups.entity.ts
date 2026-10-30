import { Check, Column, Entity, Index } from 'typeorm';
import { AppBaseEntity } from '../database/base.entity';
import { bigintTransformer } from '../common/utils/numeric.transformer';
import { BackupKind } from './types/backup.types.interface';

/**
 * Catalogue of the backup files in `storage/backups`.
 *
 * This table is deliberately left OUT of the dumps and has no foreign keys: restoring a backup
 * replaces every other table, but must never make the list of backups disappear or make the
 * restore fail because a referenced account is gone. For the same reason `kind` is a plain
 * varchar with a CHECK constraint instead of a PostgreSQL enum type: an enum type would be part
 * of the dump, and a restore could not replace a type that this table still depends on.
 */
@Entity('backups')
@Check('chk_backups_kind', `"kind" IN ('MANUAL', 'UPLOADED', 'PRE_RESTORE')`)
export class Backup extends AppBaseEntity {
  /** Random name of the file inside storage/backups (never taken from user input). */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 80, name: 'file_name' })
  fileName: string;

  /** Friendly name shown to the user and used for downloads. */
  @Column({ type: 'varchar', length: 150, name: 'display_name' })
  displayName: string;

  @Index()
  @Column({ type: 'varchar', length: 20 })
  kind: BackupKind;

  @Column({ type: 'varchar', length: 300, nullable: true })
  note: string | null;

  @Column({ type: 'bigint', name: 'size_bytes', transformer: bigintTransformer })
  sizeBytes: number;

  @Column({ type: 'varchar', length: 64, name: 'checksum_sha256' })
  checksumSha256: string;

  /** Plain id without a foreign key (see the note above). */
  @Column({ type: 'uuid', name: 'created_by_id', nullable: true })
  createdById: string | null;

  @Column({ type: 'varchar', length: 150, name: 'created_by_name' })
  createdByName: string;
}
