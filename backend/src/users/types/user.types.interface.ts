import { AccountStatus } from '../../common/enums/account-status.enum';
import { Role } from '../../common/enums/role.enum';

export interface UserView {
  id: string;
  role: Role;
  fullName: string;
  username: string | null;
  email: string | null;
  status: AccountStatus;
  lastLoginAt: Date | null;
  createdAt: Date;
}

/** What the frontend receives for the signed-in user (GET /users/me). */
export interface MeView extends UserView {
  /** The human Student ID (e.g. "ST-001") for students, otherwise null. */
  studentCode: string | null;
  studentProfileId: string | null;
  teacherProfileId: string | null;
  /** True when a student or teacher has a profile photo, so the app only asks for photos that exist. */
  hasPhoto: boolean;
}

/** Input to UsersService.createUser. Callers (students, teachers, setup) validate it first. */
export interface CreateUserInput {
  role: Role;
  fullName: string;
  username?: string | null;
  email?: string | null;
  /** Plain password; hashed with argon2id. Omitted for students. */
  password?: string | null;
  status?: AccountStatus;
}
