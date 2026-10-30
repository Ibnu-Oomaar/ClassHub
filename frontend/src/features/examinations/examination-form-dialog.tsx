import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { z } from 'zod';
import { Field } from '@/components/form-field';
import { Spinner } from '@/components/states';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Select, Textarea } from '@/components/ui/input';
import { useSettings } from '@/features/settings/use-settings';
import type { Subject } from '@/features/subjects/types';
import { getPage, patch, post } from '@/lib/api';
import { humanize } from '@/lib/format';
import { keys } from '@/lib/query-keys';
import { useAction } from '@/lib/use-action';
import { EXAMINATION_STATUSES, EXAMINATION_TYPES, type Examination } from './types';

const schema = z.object({
  name: z.string().trim().min(2, 'Enter a name for the examination.').max(150, 'Use at most 150 characters.'),
  type: z.enum(['QUIZ', 'TEST', 'MIDTERM', 'FINAL', 'MOCK', 'OTHER']),
  examDate: z.string().min(1, 'Choose the examination date.'),
  academicPeriod: z.string().trim().max(60, 'Use at most 60 characters.'),
  instructions: z.string().trim().max(4000, 'Use at most 4000 characters.'),
  status: z.enum(['DRAFT', 'SCHEDULED', 'COMPLETED', 'CANCELLED']),
});
type Values = z.infer<typeof schema>;

interface SubjectRow {
  selected: boolean;
  maxMarks: string;
}

const DEFAULT_MAX = '100';

function parseMax(text: string): number | null {
  const value = Number(text);
  if (text.trim() === '' || !Number.isFinite(value)) return null;
  if (value < 1 || value > 1000) return null;
  if (Math.abs(value * 100 - Math.round(value * 100)) > 1e-6) return null;
  return value;
}

export function ExaminationFormDialog({
  open,
  onOpenChange,
  examination,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  examination: Examination | null;
}) {
  const settings = useSettings();
  const subjects = useQuery({
    queryKey: [...keys.subjects, 'active-options'],
    queryFn: async () => (await getPage<Subject>('/subjects', { limit: 200, isActive: true })).items,
    enabled: open,
  });

  const [rows, setRows] = useState<Record<string, SubjectRow>>({});
  const [subjectsProblem, setSubjectsProblem] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: '', type: 'TEST', examDate: '', academicPeriod: '', instructions: '', status: 'SCHEDULED' } });

  useEffect(() => {
    if (!open) return;
    setSubjectsProblem(null);
    if (examination) {
      reset({
        name: examination.name,
        type: examination.type,
        examDate: examination.examDate.slice(0, 10),
        academicPeriod: examination.academicPeriod ?? '',
        instructions: examination.instructions ?? '',
        status: examination.status,
      });
      setRows(Object.fromEntries(examination.subjects.map((subject) => [subject.subjectId, { selected: true, maxMarks: String(subject.maxMarks) }])));
    } else {
      reset({ name: '', type: 'TEST', examDate: '', academicPeriod: settings.data?.currentPeriod ?? '', instructions: '', status: 'SCHEDULED' });
      setRows({});
    }
  }, [open, examination, reset, settings.data?.currentPeriod]);

  const save = useAction({
    run: (input: { values: Values; subjects: { subjectId: string; maxMarks: number }[] }) => {
      const body = {
        name: input.values.name,
        type: input.values.type,
        examDate: input.values.examDate,
        academicPeriod: input.values.academicPeriod || null,
        instructions: input.values.instructions || null,
        status: input.values.status,
        subjects: input.subjects,
      };
      return examination ? patch<Examination>(`/examinations/${examination.id}`, body) : post<Examination>('/examinations', body);
    },
    refresh: [keys.examinations, keys.marks, keys.results, keys.dashboard],
    success: (saved) => (examination ? `${saved.name} is updated.` : `${saved.name} is created.`),
    quiet: true,
    onSuccess: () => onOpenChange(false),
  });

  const submit = (values: Values) => {
    const chosen: { subjectId: string; maxMarks: number }[] = [];
    for (const [subjectId, row] of Object.entries(rows)) {
      if (!row.selected) continue;
      const maxMarks = parseMax(row.maxMarks);
      if (maxMarks === null) {
        setSubjectsProblem('Each subject needs maximum marks between 1 and 1000, with at most 2 decimals.');
        return;
      }
      chosen.push({ subjectId, maxMarks });
    }
    if (chosen.length === 0) {
      setSubjectsProblem('Select at least one subject.');
      return;
    }
    setSubjectsProblem(null);
    save.mutate({ values, subjects: chosen });
  };

  const setRow = (subjectId: string, patchRow: Partial<SubjectRow>) =>
    setRows((current) => {
      const existing: SubjectRow = current[subjectId] ?? { selected: false, maxMarks: DEFAULT_MAX };
      return { ...current, [subjectId]: { ...existing, ...patchRow } };
    });

  // Subjects already in the examination stay listed even if they have since been made inactive.
  const knownIds = new Set((subjects.data ?? []).map((subject) => subject.id));
  const extra = (examination?.subjects ?? []).filter((subject) => !knownIds.has(subject.subjectId));
  const options = [...(subjects.data ?? []).map((subject) => ({ id: subject.id, name: subject.name })), ...extra.map((subject) => ({ id: subject.subjectId, name: `${subject.subjectName} (inactive)` }))];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <form onSubmit={handleSubmit(submit)} noValidate className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>{examination ? 'Edit examination' : 'Create an examination'}</DialogTitle>
            <DialogDescription>Pick the subjects it covers and the maximum marks of each. Teachers enter marks per subject.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-5 pb-2">
            {save.isError ? <Alert tone="danger">{save.error.message}</Alert> : null}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Name" htmlFor="exam-name" error={errors.name?.message} className="sm:col-span-2" required>
                <Input id="exam-name" autoFocus={!examination} placeholder="For example Midterm, Term 1" aria-invalid={!!errors.name} {...register('name')} />
              </Field>
              <Field label="Type" htmlFor="exam-type" error={errors.type?.message}>
                <Select id="exam-type" {...register('type')}>
                  {EXAMINATION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {humanize(type)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Date" htmlFor="exam-date" error={errors.examDate?.message} required>
                <Input id="exam-date" type="date" aria-invalid={!!errors.examDate} {...register('examDate')} />
              </Field>
              <Field label="Academic period" htmlFor="exam-period" error={errors.academicPeriod?.message} hint="For example Term 1 2026. Used to group results in reports.">
                <Input id="exam-period" aria-invalid={!!errors.academicPeriod} {...register('academicPeriod')} />
              </Field>
              <Field
                label="Status"
                htmlFor="exam-status"
                error={errors.status?.message}
                hint="Draft is visible only to you. Teachers can enter marks once it is Scheduled or Completed."
              >
                <Select id="exam-status" {...register('status')}>
                  {EXAMINATION_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {humanize(status)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Instructions" htmlFor="exam-instructions" error={errors.instructions?.message} hint="Shown to teachers and students. Optional." className="sm:col-span-2">
                <Textarea id="exam-instructions" rows={3} aria-invalid={!!errors.instructions} {...register('instructions')} />
              </Field>
            </div>

            <fieldset>
              <legend className="mb-2 text-sm font-medium">
                Subjects <span className="text-pen" aria-hidden>*</span>
              </legend>
              {subjects.isPending ? (
                <div className="h-24 animate-pulse rounded-lg bg-subtle" role="status" aria-label="Loading subjects" />
              ) : subjects.isError ? (
                <Alert tone="danger">{subjects.error.message}</Alert>
              ) : options.length === 0 ? (
                <Alert tone="warning" title="There are no subjects yet">
                  <Link to="/subjects" className="font-medium text-primary underline underline-offset-2">Add the class subjects</Link> first, then create the examination.
                </Alert>
              ) : (
                <ul className="divide-y divide-border rounded-lg border border-border">
                  {options.map((option) => {
                    const row = rows[option.id] ?? { selected: false, maxMarks: DEFAULT_MAX };
                    return (
                      <li key={option.id} className="flex items-center gap-3 px-4 py-2.5">
                        <Checkbox
                          id={`subject-${option.id}`}
                          checked={row.selected}
                          onCheckedChange={(checked) => setRow(option.id, { selected: checked === true })}
                        />
                        <label htmlFor={`subject-${option.id}`} className="min-w-0 flex-1 cursor-pointer truncate font-medium">
                          {option.name}
                        </label>
                        <label className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>Out of</span>
                          <Input
                            inputMode="decimal"
                            value={row.maxMarks}
                            onChange={(event) => setRow(option.id, { maxMarks: event.target.value })}
                            disabled={!row.selected}
                            aria-label={`Maximum marks for ${option.name}`}
                            className="h-9 w-24 text-right tabular-nums"
                          />
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
              {subjectsProblem ? (
                <p role="alert" className="mt-2 text-[0.8125rem] font-medium text-pen">
                  {subjectsProblem}
                </p>
              ) : null}
            </fieldset>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? <Spinner /> : null}
              {examination ? 'Save changes' : 'Create examination'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
