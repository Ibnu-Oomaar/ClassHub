export type Role = 'CLASS_MASTER' | 'TEACHER' | 'STUDENT';

export const ROLE_LABEL: Record<Role, string> = {
  CLASS_MASTER: 'Class Master',
  TEACHER: 'Teacher',
  STUDENT: 'Student',
};

/** The signed-in person, as returned by the API. */
export interface Me {
  id: string;
  role: Role;
  fullName: string;
  username: string | null;
  email: string | null;
  status: string;
  lastLoginAt: string | null;
  createdAt: string;
  /** The Student ID (for example ST-001) for students, otherwise null. */
  studentCode: string | null;
  studentProfileId: string | null;
  teacherProfileId: string | null;
  /** True when the student or teacher has a profile photo; photos are only requested when it is. */
  hasPhoto: boolean;
}

export interface LoginResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresAt: string;
  user: Me;
}

export interface SetupStatus {
  setupCompleted: boolean;
  className: string;
}
