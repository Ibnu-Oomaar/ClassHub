import { Check, Column, Entity, Index, JoinColumn, ManyToOne, Relation, DeleteDateColumn } from 'typeorm';
import { AppBaseEntity } from '../database/base.entity';
import { User } from '../users/users.entity';
import { AnnouncementAudience } from './types/announcement.types.interface';

/** A notice written by the Class Master for everyone, only the teachers, or only the students. */
@Entity('announcements')
@Check('chk_announcements_expiry_after_publish', '"expires_at" IS NULL OR "published_at" IS NULL OR "expires_at" > "published_at"')
export class Announcement extends AppBaseEntity {
  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Index()
  @Column({ type: 'enum', enum: AnnouncementAudience, enumName: 'announcement_audience', default: AnnouncementAudience.ALL })
  audience: AnnouncementAudience;

  @Column({ type: 'boolean', name: 'is_pinned', default: false })
  isPinned: boolean;

  @Index()
  @Column({ type: 'boolean', name: 'is_published', default: true })
  isPublished: boolean;

  /** Set when the announcement is published; cleared when it goes back to draft. */
  @Column({ type: 'timestamptz', name: 'published_at', nullable: true })
  publishedAt: Date | null;

  @Column({ type: 'timestamptz', name: 'expires_at', nullable: true })
  expiresAt: Date | null;

  @Index()
  @Column({ type: 'uuid', name: 'created_by_id', nullable: true })
  createdById: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by_id' })
  createdBy: Relation<User> | null;

  @DeleteDateColumn({ type: 'timestamptz', name: 'deleted_at' })
  deletedAt: Date | null;
}
