import { Role } from '../enums/role.enum';

/**
 * The user attached to `request.user` after the JWT has been verified and the
 * account has been re-checked against the database on every request.
 */
export interface AuthenticatedUser {
  /** users.id */
  id: string;
  role: Role;
  fullName: string;
  /** teachers.id when role is TEACHER, otherwise null */
  teacherProfileId: string | null;
  /** students.id when role is STUDENT, otherwise null */
  studentProfileId: string | null;
}
