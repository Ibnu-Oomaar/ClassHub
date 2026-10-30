export interface TeacherSubjectView {
  id: string;
  teacherId: string;
  teacherName: string;
  teacherActive: boolean;
  subjectId: string;
  subjectName: string;
  subjectCode: string | null;
  subjectActive: boolean;
  assignedAt: Date;
}
