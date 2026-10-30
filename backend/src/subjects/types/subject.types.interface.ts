export interface SubjectTeacherRef {
  assignmentId: string;
  teacherId: string;
  teacherName: string;
  teacherActive: boolean;
}

export interface SubjectView {
  id: string;
  name: string;
  code: string | null;
  description: string | null;
  isActive: boolean;
  /** Empty until the Class Master assigns a teacher ("Not assigned" in the UI). */
  teachers: SubjectTeacherRef[];
  createdAt: Date;
  updatedAt: Date;
}
