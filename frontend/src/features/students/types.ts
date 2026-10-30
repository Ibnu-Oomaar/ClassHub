import type { AccountStatus, Gender } from '@/features/teachers/types';

export interface StudentSummary {
  id: string;
  userId: string;
  fullName: string;
  studentId: string;
  gender: Gender | null;
  status: AccountStatus;
  hasPhoto: boolean;
  registeredAt: string;
  deletedAt: string | null;
}

/** The Class Master's full record. Teachers only ever receive the summary fields. */
export interface StudentProfile extends StudentSummary {
  dateOfBirth: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  lastLoginAt: string | null;
  updatedAt: string;
}
