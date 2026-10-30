/** Query keys are shared so a change in one screen refreshes every list that shows the same data. */
export const keys = {
  subjects: ['subjects'] as const,
  teachers: ['teachers'] as const,
  students: ['students'] as const,
  teacherSubjects: ['teacher-subjects'] as const,
  examinations: ['examinations'] as const,
  marks: ['marks'] as const,
  results: ['results'] as const,
  grading: ['grading'] as const,
  assignments: ['assignments'] as const,
  submissions: ['submissions'] as const,
  announcements: ['announcements'] as const,
  settings: ['settings'] as const,
  backups: ['backups'] as const,
  auditLog: ['audit-log'] as const,
  dashboard: ['dashboard'] as const,
};
