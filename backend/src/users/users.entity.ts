import { Column, DeleteDateColumn, Entity, Index, OneToOne, Relation } from 'typeorm';
import { AppBaseEntity } from '../database/base.entity';
import { AccountStatus } from '../common/enums/account-status.enum';
import { Role } from '../common/enums/role.enum';
import { Student } from '../students/students.entity';
import { Teacher } from '../teachers/teachers.entity';

/**
 * Login identity for all three roles. Role-specific details live in `students` / `teachers`.
 * Class Masters have no profile table: their account is just this row.
 */
@Entity('users')
export class User extends AppBaseEntity {
  @Index()
  @Column({ type: 'enum', enum: Role, enumName: 'user_role' })
  role: Role;

  @Column({ type: 'varchar', length: 150, name: 'full_name' })
  fullName: string;

  /** Lower-cased. Class Master / Teacher login. Students have no username. */
  @Column({ type: 'varchar', length: 60, nullable: true, unique: true })
  username: string | null;

  /** Lower-cased. Class Master / Teacher login. Students have no email login. */
  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  email: string | null;

  /** argon2id hash. Null for students. Never selected by default. */
  @Column({ type: 'varchar', length: 255, name: 'password_hash', nullable: true, select: false })
  passwordHash: string | null;

  @Index()
  @Column({ type: 'enum', enum: AccountStatus, enumName: 'account_status', default: AccountStatus.ACTIVE })
  status: AccountStatus;

  @Column({ type: 'int', name: 'failed_login_attempts', default: 0 })
  failedLoginAttempts: number;

  @Column({ type: 'timestamptz', name: 'locked_until', nullable: true })
  lockedUntil: Date | null;

  @Column({ type: 'timestamptz', name: 'last_login_at', nullable: true })
  lastLoginAt: Date | null;

  /** Embedded in every JWT. Bumping it invalidates all tokens already issued to this user. */
  @Column({ type: 'int', name: 'token_version', default: 0 })
  tokenVersion: number;

  @DeleteDateColumn({ type: 'timestamptz', name: 'deleted_at' })
  deletedAt: Date | null;

  @OneToOne(() => Student, (student) => student.user)
  student?: Relation<Student> | null;

  @OneToOne(() => Teacher, (teacher) => teacher.user)
  teacher?: Relation<Teacher> | null;
}
