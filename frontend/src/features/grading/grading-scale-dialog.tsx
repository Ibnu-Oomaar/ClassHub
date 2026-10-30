import { zodResolver } from '@hookform/resolvers/zod';
import { Plus, Trash2 } from 'lucide-react';
import { useEffect } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';
import { Field } from '@/components/form-field';
import { Spinner } from '@/components/states';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { patch, post } from '@/lib/api';
import { keys } from '@/lib/query-keys';
import { useAction } from '@/lib/use-action';
import type { GradingScale } from './types';

const markInput = (label: string, allowZero: boolean) =>
  z
    .string()
    .trim()
    .min(1, `Enter the ${label}.`)
    .refine(
      (value) => Number.isFinite(Number(value)) && Number(value) >= (allowZero ? 0 : 0.01),
      `Enter a ${allowZero ? 'non-negative' : 'positive'} mark.`,
    )
    .refine((value) => Math.abs(Number(value) * 100 - Math.round(Number(value) * 100)) < 1e-6, 'At most 2 decimals.');

const bandSchema = z.object({
  grade: z.string().trim().min(1, 'Enter the grade.').max(10, 'At most 10 characters.'),
  minMark: markInput('minimum mark', true),
  maxMark: markInput('maximum mark', true),
  remark: z.string().trim().max(60, 'At most 60 characters.'),
  isPassing: z.boolean(),
});

export const gradingScaleSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter a name for the scale.').max(100, 'Use at most 100 characters.'),
    description: z.string().trim().max(500, 'Use at most 500 characters.'),
    maxMark: markInput('maximum mark for the scale', false),
    bands: z.array(bandSchema).min(1, 'Add at least one band.').max(20, 'At most 20 bands.'),
    activate: z.boolean(),
  })
  .superRefine((values, context) => {
    const seenGrades = new Set<string>();
    values.bands.forEach((band, index) => {
      const grade = band.grade.trim().toLowerCase();
      if (grade && seenGrades.has(grade)) context.addIssue({ code: 'custom', path: ['bands', index, 'grade'], message: 'This grade is already used.' });
      seenGrades.add(grade);
      const minimum = Number(band.minMark);
      const maximum = Number(band.maxMark);
      if (Number.isFinite(minimum) && Number.isFinite(maximum) && minimum > maximum) {
        context.addIssue({ code: 'custom', path: ['bands', index, 'maxMark'], message: 'Maximum mark must be at least the minimum mark.' });
      }
      if (Number.isFinite(maximum) && maximum > Number(values.maxMark)) {
        context.addIssue({ code: 'custom', path: ['bands', index, 'maxMark'], message: 'A grade range cannot exceed the scale maximum.' });
      }
    });
    const ordered = values.bands
      .map((band, index) => ({ index, minMark: Number(band.minMark), maxMark: Number(band.maxMark) }))
      .filter((band) => Number.isFinite(band.minMark) && Number.isFinite(band.maxMark))
      .sort((a, b) => a.minMark - b.minMark);
    for (let index = 1; index < ordered.length; index++) {
      if (ordered[index].minMark <= ordered[index - 1].maxMark) {
        context.addIssue({ code: 'custom', path: ['bands', ordered[index].index, 'minMark'], message: 'This grade range overlaps another band.' });
      }
    }
    const hasZero = values.bands.some((band) => band.minMark.trim() !== '' && Number(band.minMark) === 0);
    if (!hasZero) context.addIssue({ code: 'custom', path: ['bands'], message: 'One band must start at 0 marks, otherwise low scores would have no grade.' });
  });
type Values = z.infer<typeof gradingScaleSchema>;

const EMPTY_BAND = { grade: '', minMark: '', maxMark: '', remark: '', isPassing: true };
const EMPTY: Values = { name: '', description: '', maxMark: '', bands: [{ ...EMPTY_BAND }, { ...EMPTY_BAND, isPassing: false }], activate: false };

export function GradingScaleDialog({ open, onOpenChange, scale }: { open: boolean; onOpenChange: (open: boolean) => void; scale: GradingScale | null }) {
  const {
    register,
    handleSubmit,
    reset,
    control,
    setValue,
    watch,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(gradingScaleSchema), defaultValues: EMPTY });
  const { fields, append, remove } = useFieldArray({ control, name: 'bands' });

  useEffect(() => {
    if (!open) return;
    if (scale) {
      const ordered = [...scale.bands].sort((a, b) => b.minMark - a.minMark);
      reset({
        name: scale.name,
        description: scale.description ?? '',
        maxMark: String(scale.maxMark),
        bands: ordered.map((band) => ({ grade: band.grade, minMark: String(band.minMark), maxMark: String(band.maxMark), remark: band.remark ?? '', isPassing: band.isPassing })),
        activate: false,
      });
    } else {
      reset(EMPTY);
    }
  }, [open, scale, reset]);

  const save = useAction({
    run: (values: Values) => {
      const bands = values.bands.map((band) => ({
        grade: band.grade,
        minMark: Number(band.minMark),
        maxMark: Number(band.maxMark),
        remark: band.remark || null,
        isPassing: band.isPassing,
      }));
      const body = { name: values.name, description: values.description || null, maxMark: Number(values.maxMark), bands };
      return scale ? patch<GradingScale>(`/grading/${scale.id}`, body) : post<GradingScale>('/grading', { ...body, activate: values.activate });
    },
    refresh: [keys.grading, keys.marks, keys.results, keys.dashboard],
    success: (saved) => (scale ? `${saved.name} is updated.` : `${saved.name} is saved.`),
    quiet: true,
    onSuccess: () => onOpenChange(false),
  });

  const bandsError = errors.bands?.root?.message ?? errors.bands?.message;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <form onSubmit={handleSubmit((values) => save.mutate(values))} noValidate className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>{scale ? 'Edit grading scale' : 'New grading scale'}</DialogTitle>
            <DialogDescription>Enter the maximum marks for this scale and the inclusive actual-mark range for each grade.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-5 pb-2">
            {save.isError ? <Alert tone="danger">{save.error.message}</Alert> : null}
            {scale?.isActive ? (
              <Alert tone="info">This scale is in use. Changing its bands changes the grades of marks that are not published yet. Published results keep the grades they were published with.</Alert>
            ) : null}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Name" htmlFor="scale-name" error={errors.name?.message} required>
                <Input id="scale-name" autoFocus={!scale} aria-invalid={!!errors.name} {...register('name')} />
              </Field>
              <Field label="Maximum marks" htmlFor="scale-max-mark" error={errors.maxMark?.message} required>
                <Input id="scale-max-mark" inputMode="decimal" aria-invalid={!!errors.maxMark} {...register('maxMark')} />
              </Field>
              <Field label="Description" htmlFor="scale-description" error={errors.description?.message}>
                <Textarea id="scale-description" rows={1} className="min-h-10" aria-invalid={!!errors.description} {...register('description')} />
              </Field>
            </div>

            <fieldset>
              <legend className="mb-2 text-sm font-medium">Bands</legend>
              <div className="hidden gap-2 px-1 pb-1.5 text-[0.8125rem] text-muted-foreground sm:grid sm:grid-cols-[5rem_6rem_6rem_1fr_5.5rem_2.5rem]">
                <span>Grade</span>
                <span>Min mark</span>
                <span>Max mark</span>
                <span>Remark</span>
                <span>Passing</span>
                <span />
              </div>
              <ul className="space-y-3 sm:space-y-2">
                {fields.map((field, index) => {
                  const rowErrors = errors.bands?.[index];
                  return (
                    <li key={field.id} className="grid grid-cols-1 gap-2 rounded-lg border border-border p-3 sm:grid-cols-[5rem_6rem_6rem_1fr_5.5rem_2.5rem] sm:items-start sm:border-0 sm:p-0">
                      <div>
                        <Input placeholder="Grade" aria-label={`Band ${index + 1} grade`} aria-invalid={!!rowErrors?.grade} {...register(`bands.${index}.grade`)} />
                        {rowErrors?.grade ? <p role="alert" className="mt-1 text-xs font-medium text-pen">{rowErrors.grade.message}</p> : null}
                      </div>
                      <div>
                        <Input inputMode="decimal" placeholder="Min" aria-label={`Band ${index + 1} minimum mark`} className="tabular-nums" aria-invalid={!!rowErrors?.minMark} {...register(`bands.${index}.minMark`)} />
                        {rowErrors?.minMark ? <p role="alert" className="mt-1 text-xs font-medium text-pen">{rowErrors.minMark.message}</p> : null}
                      </div>
                      <div>
                        <Input inputMode="decimal" placeholder="Max" aria-label={`Band ${index + 1} maximum mark`} className="tabular-nums" aria-invalid={!!rowErrors?.maxMark} {...register(`bands.${index}.maxMark`)} />
                        {rowErrors?.maxMark ? <p role="alert" className="mt-1 text-xs font-medium text-pen">{rowErrors.maxMark.message}</p> : null}
                      </div>
                      <div>
                        <Input placeholder="Remark (optional)" aria-label={`Band ${index + 1} remark`} aria-invalid={!!rowErrors?.remark} {...register(`bands.${index}.remark`)} />
                        {rowErrors?.remark ? <p role="alert" className="mt-1 text-xs font-medium text-pen">{rowErrors.remark.message}</p> : null}
                      </div>
                      <label className="flex h-10 items-center gap-2 text-sm">
                        <Checkbox checked={watch(`bands.${index}.isPassing`)} onCheckedChange={(checked) => setValue(`bands.${index}.isPassing`, checked === true, { shouldDirty: true })} />
                        Pass
                      </label>
                      <Button type="button" variant="ghost" size="icon" aria-label={`Remove band ${index + 1}`} disabled={fields.length <= 1} onClick={() => remove(index)}>
                        <Trash2 className="text-pen" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
              {bandsError ? (
                <p role="alert" className="mt-2 text-[0.8125rem] font-medium text-pen">
                  {bandsError}
                </p>
              ) : null}
              <Button type="button" variant="outline" size="sm" className="mt-3" disabled={fields.length >= 20} onClick={() => append({ ...EMPTY_BAND })}>
                <Plus /> Add a band
              </Button>
            </fieldset>

            {!scale ? (
              <label className="flex items-start gap-3 rounded-lg border border-border px-4 py-3">
                <Checkbox className="mt-0.5" checked={watch('activate')} onCheckedChange={(checked) => setValue('activate', checked === true)} />
                <span>
                  <span className="block font-medium">Use this scale now</span>
                  <span className="block text-sm text-muted-foreground">Only one scale is in use at a time. Activating this one replaces the current scale.</span>
                </span>
              </label>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? <Spinner /> : null}
              {scale ? 'Save changes' : 'Save scale'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
