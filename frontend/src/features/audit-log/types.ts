export interface AuditLogEntry {
  id: string;
  createdAt: string;
  actorId: string | null;
  actorName: string;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
}

/** Every action the server records, grouped for the filter. Keep in step with the server's list of audited actions. */
export const AUDIT_ACTION_GROUPS: { label: string; actions: string[] }[] = [
  { label: 'Sign in and setup', actions: ['SETUP_COMPLETED', 'AUTH_LOGIN', 'AUTH_LOGIN_FAILED', 'AUTH_ACCOUNT_LOCKED', 'AUTH_PASSWORD_CHANGED'] },
  { label: 'Students', actions: ['STUDENT_CREATED', 'STUDENT_UPDATED', 'STUDENT_STATUS_CHANGED', 'STUDENT_DELETED', 'STUDENT_RESTORED'] },
  { label: 'Teachers', actions: ['TEACHER_CREATED', 'TEACHER_UPDATED', 'TEACHER_STATUS_CHANGED', 'TEACHER_DELETED', 'TEACHER_RESTORED'] },
  { label: 'Subjects', actions: ['SUBJECT_CREATED', 'SUBJECT_UPDATED', 'SUBJECT_DELETED', 'TEACHER_SUBJECT_ASSIGNED', 'TEACHER_SUBJECT_REMOVED'] },
  {
    label: 'Assignments',
    actions: ['ASSIGNMENT_CREATED', 'ASSIGNMENT_UPDATED', 'ASSIGNMENT_DELETED', 'ASSIGNMENT_AVAILABILITY_CHANGED', 'SUBMISSION_CREATED', 'SUBMISSION_UPDATED', 'SUBMISSION_GRADED'],
  },
  {
    label: 'Examinations and marks',
    actions: ['EXAMINATION_CREATED', 'EXAMINATION_UPDATED', 'EXAMINATION_DELETED', 'MARKS_SAVED', 'MARKS_UPDATED', 'MARKS_SUBMITTED', 'MARKS_APPROVED', 'MARKS_REJECTED'],
  },
  { label: 'Results', actions: ['RESULTS_PUBLISHED', 'RESULTS_UNPUBLISHED'] },
  { label: 'Grading scales', actions: ['GRADING_SCALE_CREATED', 'GRADING_SCALE_UPDATED', 'GRADING_SCALE_ACTIVATED', 'GRADING_SCALE_DELETED'] },
  { label: 'Announcements', actions: ['ANNOUNCEMENT_CREATED', 'ANNOUNCEMENT_UPDATED', 'ANNOUNCEMENT_DELETED'] },
  { label: 'Settings, files and reports', actions: ['SETTINGS_UPDATED', 'FILE_UPLOADED', 'FILE_DELETED', 'REPORT_GENERATED'] },
  { label: 'Backups', actions: ['BACKUP_CREATED', 'BACKUP_FAILED', 'BACKUP_UPLOADED', 'BACKUP_RESTORED', 'BACKUP_DELETED'] },
];
