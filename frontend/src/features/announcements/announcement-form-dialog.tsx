import { zodResolver } from '@hookform/resolvers/zod';
import { format } from 'date-fns';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Field } from '@/components/form-field';
import { Spinner } from '@/components/states';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Select, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { patch, post } from '@/lib/api';
import { keys } from '@/lib/query-keys';
import { useAction } from '@/lib/use-action';
import { AUDIENCE_LABEL, type Announcement, type Audience } from './types';

const schema = z.object({
  title: z.string().trim().min(2, 'Enter a title.').max(200, 'Use at most 200 characters.'),
  body: z.string().trim().min(2, 'Write the announcement.').max(10000, 'Use at most 10000 characters.'),
  audience: z.enum(['ALL', 'TEACHERS', 'STUDENTS']),
  expiresAt: z.string(),
  isPinned: z.boolean(),
  isPublished: z.boolean(),
});
type Values = z.infer<typeof schema>;

const EMPTY: Values = { title: '', body: '', audience: 'ALL', expiresAt: '', isPinned: false, isPublished: true };

export function AnnouncementFormDialog({ open, onOpenChange, announcement }: { open: boolean; onOpenChange: (open: boolean) => void; announcement: Announcement | null }) {
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  useEffect(() => {
    if (!open) return;
    reset(
      announcement
        ? {
            title: announcement.title,
            body: announcement.body,
            audience: announcement.audience,
            expiresAt: announcement.expiresAt ? format(new Date(announcement.expiresAt), "yyyy-MM-dd'T'HH:mm") : '',
            isPinned: announcement.isPinned,
            isPublished: announcement.isPublished,
          }
        : EMPTY,
    );
  }, [open, announcement, reset]);

  const save = useAction({
    run: (values: Values) => {
      const body = {
        title: values.title,
        body: values.body,
        audience: values.audience as Audience,
        isPinned: values.isPinned,
        isPublished: values.isPublished,
        expiresAt: values.expiresAt ? new Date(values.expiresAt).toISOString() : null,
      };
      return announcement ? patch<Announcement>(`/announcements/${announcement.id}`, body) : post<Announcement>('/announcements', body);
    },
    refresh: [keys.announcements, keys.dashboard],
    success: (saved) => (saved.isPublished ? 'The announcement is published.' : 'Saved as a draft. Nobody else can see it yet.'),
    quiet: true,
    onSuccess: () => onOpenChange(false),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <form onSubmit={handleSubmit((values) => save.mutate(values))} noValidate className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>{announcement ? 'Edit announcement' : 'New announcement'}</DialogTitle>
            <DialogDescription>Choose who it is for. Published announcements appear on everyone&rsquo;s home page.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4 pb-2">
            {save.isError ? <Alert tone="danger">{save.error.message}</Alert> : null}
            <Field label="Title" htmlFor="announcement-title" error={errors.title?.message} required>
              <Input id="announcement-title" autoFocus aria-invalid={!!errors.title} {...register('title')} />
            </Field>
            <Field label="Message" htmlFor="announcement-body" error={errors.body?.message} required>
              <Textarea id="announcement-body" rows={7} aria-invalid={!!errors.body} {...register('body')} />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Who can read it" htmlFor="announcement-audience">
                <Select id="announcement-audience" {...register('audience')}>
                  {(Object.keys(AUDIENCE_LABEL) as Audience[]).map((audience) => (
                    <option key={audience} value={audience}>
                      {AUDIENCE_LABEL[audience]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Hide it after" htmlFor="announcement-expires" error={errors.expiresAt?.message} hint="Optional. It then moves to Expired.">
                <Input id="announcement-expires" type="datetime-local" {...register('expiresAt')} />
              </Field>
            </div>
            <div className="space-y-3 rounded-lg border border-border px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium">Publish now</p>
                  <p className="text-sm text-muted-foreground">Turn off to keep it as a draft only you can see.</p>
                </div>
                <Switch checked={watch('isPublished')} onCheckedChange={(checked) => setValue('isPublished', checked, { shouldDirty: true })} aria-label="Publish now" />
              </div>
              <div className="flex items-center justify-between gap-4 border-t border-border pt-3">
                <div>
                  <p className="font-medium">Pin to the top</p>
                  <p className="text-sm text-muted-foreground">Pinned announcements stay above the rest.</p>
                </div>
                <Switch checked={watch('isPinned')} onCheckedChange={(checked) => setValue('isPinned', checked, { shouldDirty: true })} aria-label="Pin to the top" />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? <Spinner /> : null}
              {announcement ? 'Save changes' : watch('isPublished') ? 'Publish' : 'Save draft'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
