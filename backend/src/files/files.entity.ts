import { Column, Entity, Index, JoinColumn, ManyToOne, Relation } from 'typeorm';
import { AppBaseEntity } from '../database/base.entity';
import { bigintTransformer } from '../common/utils/numeric.transformer';
import { User } from '../users/users.entity';
import { FileCategory, FileOwnerType } from './types/file.types.interface';

/**
 * Metadata for every file kept in local storage. The bytes live on disk under
 * `storage/<category directory>/<stored_name>`; this row is what authorization is checked against.
 */
@Entity('files')
@Index('idx_files_owner', ['ownerType', 'ownerId'])
export class FileRecord extends AppBaseEntity {
  @Index()
  @Column({ type: 'enum', enum: FileCategory, enumName: 'file_category' })
  category: FileCategory;

  @Column({ type: 'varchar', length: 255, name: 'original_name' })
  originalName: string;

  /** Random server-generated name; the client never controls where a file is written. */
  @Column({ type: 'varchar', length: 120, name: 'stored_name', unique: true })
  storedName: string;

  @Column({ type: 'varchar', length: 150, name: 'mime_type' })
  mimeType: string;

  @Column({ type: 'bigint', name: 'size_bytes', transformer: bigintTransformer })
  sizeBytes: number;

  @Column({ type: 'char', length: 64, name: 'checksum_sha256' })
  checksumSha256: string;

  @Column({ type: 'uuid', name: 'uploaded_by_id', nullable: true })
  uploadedById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'uploaded_by_id' })
  uploadedBy?: Relation<User> | null;

  /** Null until the owning feature links the upload to a record. */
  @Column({ type: 'varchar', length: 40, name: 'owner_type', nullable: true })
  ownerType: FileOwnerType | null;

  @Column({ type: 'uuid', name: 'owner_id', nullable: true })
  ownerId: string | null;
}
