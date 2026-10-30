import type { Role } from '@/auth/types';

export type ReportCell = string | number | null;

export interface ReportColumn {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
}

export interface ReportSection {
  heading: string | null;
  columns: ReportColumn[];
  rows: Record<string, ReportCell>[];
  emptyMessage: string;
}

export interface ReportDocument {
  title: string;
  subtitle: string | null;
  className: string;
  generatedAt: string;
  summary: { label: string; value: ReportCell }[];
  sections: ReportSection[];
  notes: string[];
  fileStem: string;
}

export type ReportParam = 'examinationId' | 'studentId' | 'subjectId' | 'assignmentId' | 'academicPeriod';

export interface ReportDefinition {
  id: string;
  label: string;
  description: string;
  roles: Role[];
  /** Filters this report accepts. */
  params: ReportParam[];
  /** Filters the person has to choose before the report can be made. */
  required: ReportParam[];
}

export const REPORTS: ReportDefinition[] = [
  {
    id: 'my-performance',
    label: 'My performance',
    description: 'Your published results in every examination, with your average and position.',
    roles: ['STUDENT'],
    params: [],
    required: [],
  },
  {
    id: 'examination-results',
    label: 'Examination results',
    description: 'The ranked results of one published examination, subject by subject.',
    roles: ['CLASS_MASTER'],
    params: ['examinationId'],
    required: ['examinationId'],
  },
  {
    id: 'student-performance',
    label: 'Student performance',
    description: 'One student across all published examinations.',
    roles: ['CLASS_MASTER'],
    params: ['studentId'],
    required: ['studentId'],
  },
  {
    id: 'subject-performance',
    label: 'Subject performance',
    description: 'How the class did in one subject, per examination.',
    roles: ['CLASS_MASTER', 'TEACHER'],
    params: ['subjectId', 'examinationId'],
    required: ['subjectId'],
  },
  {
    id: 'class-performance',
    label: 'Class performance',
    description: 'Class average, pass rate and top student per examination.',
    roles: ['CLASS_MASTER'],
    params: ['academicPeriod'],
    required: [],
  },
  {
    id: 'rankings',
    label: 'Class ranking',
    description: 'Every student ranked by their average across published examinations.',
    roles: ['CLASS_MASTER'],
    params: ['academicPeriod'],
    required: [],
  },
  {
    id: 'assignment-performance',
    label: 'Assignment performance',
    description: 'How many students handed in and how they were graded, per assignment.',
    roles: ['CLASS_MASTER', 'TEACHER'],
    params: ['subjectId', 'assignmentId'],
    required: [],
  },
  {
    id: 'teacher-subjects',
    label: 'Teachers and subjects',
    description: 'Which teacher teaches which subject, and the subjects that have no teacher.',
    roles: ['CLASS_MASTER'],
    params: [],
    required: [],
  },
];
