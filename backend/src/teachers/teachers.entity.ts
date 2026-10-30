import { Column, DeleteDateColumn, Entity, JoinColumn, ManyToOne, OneToOne, Relation } from 'typeorm';
import { AppBaseEntity } from '../database/base.entity';
import { Gender } from '../common/enums/gender.enum';
import { FileRecord } from '../files/files.entity';
import { User } from '../users/users.entity';

/**
 * Teacher profile. Name, username/email, password and account status live on the linked `users`
 * row. Which subjects a teacher may teach is decided by the Class Master in `teacher_subjects`.
 */
@Entity('teachers')
export class Teacher extends AppBaseEntity {
  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @OneToOne(() => User, (user) => user.teacher, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: Relation<User>;

  @Column({ type: 'enum', enum: Gender, enumName: 'gender', nullable: true })
  gender: Gender | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  phone: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  /** Qualification or short description shown on the teacher's profile. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  qualification: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'uuid', name: 'profile_photo_id', nullable: true })
  profilePhotoId: string | null;

  @ManyToOne(() => FileRecord, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'profile_photo_id' })
  profilePhoto?: Relation<FileRecord> | null;

  @DeleteDateColumn({ type: 'timestamptz', name: 'deleted_at' })
  deletedAt: Date | null;
}
