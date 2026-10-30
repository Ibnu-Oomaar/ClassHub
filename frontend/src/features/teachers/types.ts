export type AccountStatus = 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
export type Gender = 'MALE' | 'FEMALE';

export interface TeacherSubjectRef {
  assignmentId: string;
  subjectId: string;
  subjectName: string;
  subjectCode: string | null;
  subjectActive: boolean;
}

export interface TeacherSummary {
  id: string;
  userId: string;
  fullName: string;
  username: string | null;
  email: string | null;
  status: AccountStatus;
  hasPhoto: boolean;
  subjects: TeacherSubjectRef[];
  createdAt: string;
  deletedAt: string | null;
}

export interface TeacherProfile extends TeacherSummary {
  gender: Gender | null;
  phone: string | null;
  address: string | null;
  qualification: string | null;
  notes: string | null;
  lastLoginAt: string | null;
  updatedAt: string;
}
