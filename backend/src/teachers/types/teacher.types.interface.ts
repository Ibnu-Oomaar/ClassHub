import { AccountStatus } from '../../common/enums/account-status.enum';
import { Gender } from '../../common/enums/gender.enum';

export interface TeacherSubjectRef {
  assignmentId: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string | null;
  subjectActive: boolean;
}

export interface TeacherSummaryView {
  id: string;
  userId: string;
  fullName: string;
  username: string | null;
  email: string | null;
  status: AccountStatus;
  hasPhoto: boolean;
  subjects: TeacherSubjectRef[];
  createdAt: Date;
  deletedAt: Date | null;
}

export interface TeacherProfileView extends TeacherSummaryView {
  gender: Gender | null;
  phone: string | null;
  address: string | null;
  qualification: string | null;
  notes: string | null;
  lastLoginAt: Date | null;
  updatedAt: Date;
}
