import { Column, DeleteDateColumn, Entity, JoinColumn, ManyToOne, OneToOne, Relation } from 'typeorm';
import { AppBaseEntity } from '../database/base.entity';
import { Gender } from '../common/enums/gender.enum';
import { FileRecord } from '../files/files.entity';
import { User } from '../users/users.entity';

/**
 * Student profile. The student's full name and account status live on the linked `users` row;
 * everything here is maintained exclusively by the Class Master.
 */
@Entity('students')
export class Student extends AppBaseEntity {
  @Column({ type: 'uuid', name: 'user_id' })
  userId: string;

  @OneToOne(() => User, (user) => user.student, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: Relation<User>;

  /** Human-facing Student ID assigned by the Class Master. Stored upper-case, no spaces. */
  @Column({ type: 'varchar', length: 40, name: 'student_id', unique: true })
  studentId: string;

  @Column({ type: 'enum', enum: Gender, enumName: 'gender', nullable: true })
  gender: Gender | null;

  @Column({ type: 'date', name: 'date_of_birth', nullable: true })
  dateOfBirth: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  /** Private notes for the Class Master. Never shown to teachers or to the student. */
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
