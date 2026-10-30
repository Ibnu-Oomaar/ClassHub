import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Relation } from 'typeorm';
import { User } from '../users/users.entity';

/**
 * Append-only trail of important actions (account changes, marks, results, backups...).
 * The actor's name is copied into the row so the history stays readable even if the account
 * is later renamed or removed.
 */
@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;

  @Column({ type: 'uuid', name: 'actor_id', nullable: true })
  actorId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actor_id' })
  actor?: Relation<User> | null;

  @Column({ type: 'varchar', length: 150, name: 'actor_name' })
  actorName: string;

  @Column({ type: 'varchar', length: 20, name: 'actor_role', nullable: true })
  actorRole: string | null;

  @Index()
  @Column({ type: 'varchar', length: 80 })
  action: string;

  @Index()
  @Column({ type: 'varchar', length: 60, name: 'entity_type' })
  entityType: string;

  @Column({ type: 'varchar', length: 64, name: 'entity_id', nullable: true })
  entityId: string | null;

  @Column({ type: 'varchar', length: 255 })
  summary: string;

  @Column({ type: 'jsonb', nullable: true })
  details: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 64, name: 'ip_address', nullable: true })
  ipAddress: string | null;
}
