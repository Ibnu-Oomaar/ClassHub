export interface SubjectTeacherRef {
  assignmentId: string;
  teacherId: string;
  teacherName: string;
  teacherActive: boolean;
}

export interface Subject {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  isActive: boolean;
  teachers: SubjectTeacherRef[];
  createdAt: string;
  updatedAt: string;
}
