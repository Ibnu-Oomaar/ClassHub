import { zodResolver } from '@hookform/resolvers/zod';
import { Check } from 'lucide-react';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Field } from '@/components/form-field';
import { PageHeader, Section } from '@/components/page-header';
import { QueryState, RowsSkeleton, Spinner } from '@/components/states';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { patch } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { keys } from '@/lib/query-keys';
import { useAction } from '@/lib/use-action';
import type { Settings } from './types';
import { useSettings } from './use-settings';

const schema = z.object({
  academicYear: z.string().trim().max(40, 'Use at most 40 characters.'),
  currentPeriod: z.string().trim().max(60, 'Use at most 60 characters.'),
});
type Values = z.infer<typeof schema>;

function SettingsForm({ settings }: { settings: Settings }) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { academicYear: settings.academicYear ?? '', currentPeriod: settings.currentPeriod ?? '' },
  });

  useEffect(() => {
    reset({ academicYear: settings.academicYear ?? '', currentPeriod: settings.currentPeriod ?? '' });
  }, [settings, reset]);

  const save = useAction({
    run: (values: Values) => patch<Settings>('/settings', { academicYear: values.academicYear || null, currentPeriod: values.currentPeriod || null }),
    refresh: [keys.settings],
    success: 'Settings saved.',
    quiet: true,
  });

  const submissions = useAction({
    run: (enabled: boolean) => patch<Settings>('/settings', { studentSubmissionsEnabled: enabled }),
    refresh: [keys.settings, keys.dashboard, keys.assignments],
    success: (saved) => (saved.studentSubmissionsEnabled ? 'Students can hand in work again.' : 'Hand-ins are switched off for the whole class.'),
  });

  return (
    <>
      <Section title="Academic year" description="Shown on reports. The current period is filled in when you create a new examination.">
        <form onSubmit={handleSubmit((values) => save.mutate(values))} noValidate className="max-w-xl space-y-5">
          {save.isError ? <Alert tone="danger">{save.error.message}</Alert> : null}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field label="Academic year" htmlFor="academic-year" error={errors.academicYear?.message} hint="For example 2026 or 2026/2027.">
              <Input id="academic-year" aria-invalid={!!errors.academicYear} {...register('academicYear')} />
            </Field>
            <Field label="Current period" htmlFor="current-period" error={errors.currentPeriod?.message} hint="For example Term 1.">
              <Input id="current-period" aria-invalid={!!errors.currentPeriod} {...register('currentPeriod')} />
            </Field>
          </div>
          <Button type="submit" disabled={!isDirty || save.isPending}>
            {save.isPending ? <Spinner /> : <Check />}
            Save
          </Button>
        </form>
      </Section>

      <Section title="Assignment hand-ins">
        <div className="flex max-w-xl items-start justify-between gap-6 rounded-xl border border-border bg-surface px-5 py-4">
          <div>
            <p className="font-medium">Students can hand in work</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Turn this off to stop every hand-in and edit across the class, for example during exams. Assignments and grades stay visible.
            </p>
          </div>
          <Switch
            checked={settings.studentSubmissionsEnabled}
            disabled={submissions.isPending}
            onCheckedChange={(checked) => submissions.mutate(checked)}
            aria-label="Students can hand in work"
          />
        </div>
      </Section>

      <Section title="About this class">
        <dl className="max-w-xl divide-y divide-border border-y border-border text-[0.9375rem]">
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-muted-foreground">Class</dt>
            <dd className="font-medium">{settings.className}</dd>
          </div>
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-muted-foreground">Set up on</dt>
            <dd>{formatDateTime(settings.setupCompletedAt)}</dd>
          </div>
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-muted-foreground">Settings last changed</dt>
            <dd>{settings.updatedAt ? formatDateTime(settings.updatedAt) : 'Never'}</dd>
          </div>
        </dl>
        <p className="mt-3 max-w-xl text-sm text-muted-foreground">CLASSHUB is built for this one class, so the class name is fixed.</p>
      </Section>
    </>
  );
}

export default function SettingsPage() {
  const query = useSettings();
  return (
    <>
      <PageHeader title="Settings" description="Class-wide options." />
      <QueryState query={query} skeleton={<RowsSkeleton rows={4} />}>
        {(settings) => <SettingsForm settings={settings} />}
      </QueryState>
    </>
  );
}
