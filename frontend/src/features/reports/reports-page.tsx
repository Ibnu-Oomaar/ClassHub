import { useQuery } from '@tanstack/react-query';
import { FileBarChart } from 'lucide-react';
import { useMemo } from 'react';
import { useMe } from '@/auth/auth-context';
import { DownloadButton } from '@/components/download-button';
import { Field } from '@/components/form-field';
import { PageHeader } from '@/components/page-header';
import { EmptyState, QueryState, RowsSkeleton } from '@/components/states';
import { Input, Select } from '@/components/ui/input';
import type { Assignment } from '@/features/assignments/types';
import type { Examination } from '@/features/examinations/types';
import { useSettings } from '@/features/settings/use-settings';
import type { StudentSummary } from '@/features/students/types';
import type { Subject } from '@/features/subjects/types';
import { get, getPage, type Query } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { keys } from '@/lib/query-keys';
import { useListParams } from '@/lib/use-list-params';
import { ReportView } from './report-view';
import { REPORTS, type ReportDefinition, type ReportDocument, type ReportParam } from './types';

const DEFAULTS = { report: '', examinationId: '', studentId: '', subjectId: '', assignmentId: '', academicPeriod: '' };
type Values = typeof DEFAULTS;

const LABEL: Record<ReportParam, string> = {
  examinationId: 'Examination',
  studentId: 'Student',
  subjectId: 'Subject',
  assignmentId: 'Assignment',
  academicPeriod: 'Academic period',
};

export default function ReportsPage() {
  const me = useMe();
  const isTeacher = me.role === 'TEACHER';
  const available = useMemo(() => REPORTS.filter((report) => report.roles.includes(me.role)), [me.role]);
  const { values, update } = useListParams(DEFAULTS);
  const settings = useSettings();

  const definition: ReportDefinition = available.find((report) => report.id === values.report) ?? (available[0] as ReportDefinition);
  const needs = (param: ReportParam) => definition.params.includes(param);

  const examinations = useQuery({
    queryKey: [...keys.examinations, 'published-options'],
    queryFn: async () => (await getPage<Examination>('/examinations', { limit: 100, resultsPublished: true, sortBy: 'examDate', sortOrder: 'DESC' })).items,
    enabled: needs('examinationId'),
  });
  const students = useQuery({
    queryKey: [...keys.students, 'options'],
    queryFn: async () => (await getPage<StudentSummary>('/students', { limit: 200 })).items,
    enabled: needs('studentId'),
  });
  const subjects = useQuery({
    queryKey: [...keys.subjects, 'report-options', me.role, me.teacherProfileId],
    queryFn: async () => (await getPage<Subject>('/subjects', { limit: 200, teacherId: isTeacher ? me.teacherProfileId : undefined })).items,
    enabled: needs('subjectId'),
  });
  const assignments = useQuery({
    queryKey: [...keys.assignments, 'report-options', values.subjectId],
    queryFn: async () => (await getPage<Assignment>('/assignments', { limit: 100, subjectId: values.subjectId, sortBy: 'dueAt', sortOrder: 'DESC' })).items,
    enabled: needs('assignmentId'),
  });

  const params: Query = {};
  for (const param of definition.params) {
    const value = values[param as keyof Values];
    if (value) params[param] = value;
  }
  const ready = definition.required.every((param) => Boolean(params[param]));

  const report = useQuery({
    queryKey: ['reports', definition.id, params],
    queryFn: () => get<ReportDocument>(`/reports/${definition.id}`, { ...params, format: 'json' }),
    enabled: ready,
    staleTime: 0,
  });

  const change = (param: ReportParam, value: string) => {
    // Changing the subject makes a previously chosen assignment meaningless.
    update(param === 'subjectId' ? { subjectId: value, assignmentId: '' } : ({ [param]: value } as Partial<Values>));
  };

  return (
    <>
      <PageHeader
        title={me.role === 'STUDENT' ? 'My report' : 'Reports'}
        description={me.role === 'STUDENT' ? 'Your own published results in one place. You can download it as a PDF.' : 'Reports use published results only. Download any of them as a PDF or a spreadsheet (CSV).'}
      />

      {available.length > 1 ? (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Report" htmlFor="report-type" className="sm:col-span-2 lg:col-span-1" hint={definition.description}>
            <Select id="report-type" value={definition.id} onChange={(event) => update({ report: event.target.value, examinationId: '', studentId: '', subjectId: '', assignmentId: '', academicPeriod: '' })}>
              {available.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </Select>
          </Field>

          {needs('examinationId') ? (
            <Field label={`${LABEL.examinationId}${definition.required.includes('examinationId') ? '' : ' (optional)'}`} htmlFor="report-exam" required={definition.required.includes('examinationId')} hint={examinations.data && examinations.data.length === 0 ? 'No results have been published yet.' : undefined}>
              <Select id="report-exam" value={values.examinationId} onChange={(event) => change('examinationId', event.target.value)} disabled={examinations.isPending}>
                <option value="">{definition.required.includes('examinationId') ? 'Choose an examination' : 'All published examinations'}</option>
                {(examinations.data ?? []).map((exam) => (
                  <option key={exam.id} value={exam.id}>
                    {exam.name} ({formatDate(exam.examDate)})
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          {needs('studentId') ? (
            <Field label={LABEL.studentId} htmlFor="report-student" required hint={students.data && students.data.length === 0 ? 'There are no students yet.' : undefined}>
              <Select id="report-student" value={values.studentId} onChange={(event) => change('studentId', event.target.value)} disabled={students.isPending}>
                <option value="">Choose a student</option>
                {(students.data ?? []).map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.fullName} ({student.studentId})
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          {needs('subjectId') ? (
            <Field label={`${LABEL.subjectId}${definition.required.includes('subjectId') ? '' : ' (optional)'}`} htmlFor="report-subject" required={definition.required.includes('subjectId')}>
              <Select id="report-subject" value={values.subjectId} onChange={(event) => change('subjectId', event.target.value)} disabled={subjects.isPending}>
                <option value="">{definition.required.includes('subjectId') ? 'Choose a subject' : isTeacher ? 'All my subjects' : 'All subjects'}</option>
                {(subjects.data ?? []).map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          {needs('assignmentId') ? (
            <Field label={`${LABEL.assignmentId} (optional)`} htmlFor="report-assignment">
              <Select id="report-assignment" value={values.assignmentId} onChange={(event) => change('assignmentId', event.target.value)} disabled={assignments.isPending}>
                <option value="">All assignments</option>
                {(assignments.data ?? []).map((assignment) => (
                  <option key={assignment.id} value={assignment.id}>
                    {assignment.title}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          {needs('academicPeriod') ? (
            <Field label={`${LABEL.academicPeriod} (optional)`} htmlFor="report-period" hint="Leave empty for every period.">
              <Input id="report-period" value={values.academicPeriod} onChange={(event) => change('academicPeriod', event.target.value)} placeholder={settings.data?.currentPeriod ?? 'For example Term 1'} />
            </Field>
          ) : null}
        </div>
      ) : null}

      {!ready ? (
        <EmptyState icon={<FileBarChart />} title="Choose what to report on" description={`Pick the ${definition.required.map((param) => LABEL[param].toLowerCase()).join(' and ')} above to see the report.`} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{definition.description}</p>
            <div className="flex gap-2">
              <DownloadButton url={`/reports/${definition.id}`} params={{ ...params, format: 'pdf' }} fallbackName={`${definition.id}.pdf`}>
                PDF
              </DownloadButton>
              <DownloadButton url={`/reports/${definition.id}`} params={{ ...params, format: 'csv' }} fallbackName={`${definition.id}.csv`}>
                CSV
              </DownloadButton>
            </div>
          </div>
          <QueryState query={report} skeleton={<RowsSkeleton rows={6} />}>
            {(document) => <ReportView report={document} />}
          </QueryState>
        </>
      )}
    </>
  );
}
