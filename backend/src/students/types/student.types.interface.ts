import { AccountStatus } from '../../common/enums/account-status.enum';
import { Gender } from '../../common/enums/gender.enum';

/** What teachers see: enough to identify a student in the class, no private contact details. */
export interface StudentSummaryView {
  id: string;
  userId: string;
  fullName: string;
  studentId: string;
  gender: Gender | null;
  status: AccountStatus;
  hasPhoto: boolean;
  registeredAt: Date;
  deletedAt: Date | null;
}

/** Full record for the Class Master. */
export interface StudentProfileView extends StudentSummaryView {
  dateOfBirth: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  lastLoginAt: Date | null;
  updatedAt: Date;
}

/** What a student sees about themselves: the official record without the Class Master's private notes. */
export type StudentSelfView = Omit<StudentProfileView, 'notes' | 'lastLoginAt'> & { className: string | null };
