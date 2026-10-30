import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Archive, History, Plus, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DownloadButton } from '@/components/download-button';
import { Field } from '@/components/form-field';
import { PageHeader } from '@/components/page-header';
import { Pagination } from '@/components/pagination';
import { EmptyState, QueryState, RowsSkeleton, Spinner } from '@/components/states';
import { StatusBadge } from '@/components/status-badge';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/input';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { del, get, getPage, post, upload } from '@/lib/api';
import { formatBytes, formatDateTime, formatRelative } from '@/lib/format';
import { keys } from '@/lib/query-keys';
import { useAction } from '@/lib/use-action';
import { useListParams } from '@/lib/use-list-params';
import { RestoreDialog } from './restore-dialog';
import type { Backup, BackupStatus } from './types';

const DEFAULTS = { kind: '' };

function CreateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [note, setNote] = useState('');
  const create = useAction({
    run: () => post<Backup>('/backups', { note: note.trim() || undefined }, { timeout: 30 * 60_000 }),
    refresh: [keys.backups, keys.dashboard],
    success: (backup) => `Backup made: ${backup.displayName}.`,
    quiet: true,
    onSuccess: () => {
      setNote('');
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={(next) => (create.isPending ? undefined : onOpenChange(next))}>
      <DialogContent size="sm">
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
          className="flex min-h-0 flex-col"
        >
          <DialogHeader>
            <DialogTitle>Make a backup</DialogTitle>
            <DialogDescription>A full copy of all records: people, subjects, marks, results, announcements, settings and the audit log.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4 pb-2">
            {create.isError ? <Alert tone="danger">{create.error.message}</Alert> : null}
            <Field label="Note" htmlFor="backup-note" hint="Optional. For example Before publishing Term 1 results.">
              <Input id="backup-note" autoFocus maxLength={200} value={note} onChange={(event) => setNote(event.target.value)} disabled={create.isPending} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? <Spinner /> : <Archive />}
              {create.isPending ? 'Making the backup' : 'Make backup'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UploadDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const send = useAction({
    run: () => {
      if (!file) throw new Error('Choose a backup file first.');
      return upload<Backup>('/backups/upload', file, { note: note.trim() || undefined });
    },
    refresh: [keys.backups],
    success: (backup) => `${backup.displayName} is added to the list. Restore it when you are ready.`,
    quiet: true,
    onSuccess: () => {
      setFile(null);
      setNote('');
      onOpenChange(false);
    },
  });

  return (
    <Dialog open={open} onOpenChange={(next) => (send.isPending ? undefined : onOpenChange(next))}>
      <DialogContent size="sm">
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (file) send.mutate();
          }}
          className="flex min-h-0 flex-col"
        >
          <DialogHeader>
            <DialogTitle>Upload a backup</DialogTitle>
            <DialogDescription>Add a backup file (.dump) made by CLASSHUB, for example on another computer. Uploading does not change any data.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4 pb-2">
            {send.isError ? <Alert tone="danger">{send.error.message}</Alert> : null}
            <div>
              <p className="mb-2 text-sm font-medium">Backup file</p>
              <Button type="button" variant="outline" onClick={() => input.current?.click()} disabled={send.isPending}>
                <Upload /> {file ? 'Choose another file' : 'Choose a file'}
              </Button>
              {file ? (
                <p className="mt-2 text-sm">
                  <span className="font-medium">{file.name}</span> <span className="text-muted-foreground">({formatBytes(file.size)})</span>
                </p>
              ) : null}
              <input ref={input} type="file" accept=".dump,application/octet-stream" className="sr-only" tabIndex={-1} aria-label="Backup file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            </div>
            <Field label="Note" htmlFor="upload-note" hint="Optional.">
              <Input id="upload-note" maxLength={200} value={note} onChange={(event) => setNote(event.target.value)} disabled={send.isPending} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={send.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={!file || send.isPending}>
              {send.isPending ? <Spinner /> : null}
              {send.isPending ? 'Uploading and checking' : 'Upload'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function BackupsPage() {
  const { values, page, update, setPage } = useListParams(DEFAULTS);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [restoring, setRestoring] = useState<Backup | null>(null);
  const [removing, setRemoving] = useState<Backup | null>(null);

  const status = useQuery({
    queryKey: [...keys.backups, 'status'],
    queryFn: () => get<BackupStatus>('/backups/status'),
    refetchInterval: (query) => (query.state.data?.busy ? 3000 : false),
  });
  const query = useQuery({
    queryKey: [...keys.backups, 'list', values, page],
    queryFn: () => getPage<Backup>('/backups', { page, limit: 20, kind: values.kind }),
    placeholderData: keepPreviousData,
  });

  const remove = useAction({
    run: (backup: Backup) => del(`/backups/${backup.id}`),
    refresh: [keys.backups, keys.dashboard],
    success: 'The backup is deleted.',
    onSuccess: () => setRemoving(null),
  });

  const tools = status.data;
  const canMake = tools ? tools.toolsAvailable && !tools.busy : true;

  return (
    <>
      <PageHeader
        title="Backups"
        description="A backup is a copy of all your records. Make one before big changes, and keep a copy on another disk or computer."
        actions={
          <>
            <Button variant="outline" onClick={() => setUploading(true)}>
              <Upload /> Upload
            </Button>
            <Button onClick={() => setCreating(true)} disabled={!canMake}>
              <Plus /> Make a backup
            </Button>
          </>
        }
      />

      {tools && !tools.toolsAvailable ? (
        <Alert tone="danger" title="Backups cannot run on this computer yet" className="mb-6">
          {tools.toolsProblem ?? 'The PostgreSQL tools pg_dump and pg_restore were not found.'}
        </Alert>
      ) : null}
      {tools?.busy ? (
        <Alert tone="info" title="A backup or restore is running" className="mb-6">
          Please wait. This page updates by itself.
        </Alert>
      ) : null}

      {tools ? (
        <dl className="mb-7 grid grid-cols-2 gap-x-6 gap-y-4 border-y border-border py-4 sm:grid-cols-4">
          <div>
            <dt className="text-sm text-muted-foreground">Backups kept</dt>
            <dd className="mt-0.5 font-display text-3xl leading-none">{tools.total}</dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Space used</dt>
            <dd className="mt-0.5 font-display text-3xl leading-none">{formatBytes(tools.totalSizeBytes)}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-sm text-muted-foreground">Latest backup</dt>
            <dd className="mt-0.5 text-[0.9375rem]">
              {tools.latestBackupAt ? (
                <>
                  <span className="font-medium">{formatDateTime(tools.latestBackupAt)}</span> <span className="text-muted-foreground">({formatRelative(tools.latestBackupAt)})</span>
                </>
              ) : (
                <span className="font-medium text-pen">None yet</span>
              )}
            </dd>
          </div>
        </dl>
      ) : null}

      <Alert tone="info" className="mb-6">
        A backup holds the database only. Uploaded files (photos, assignment files and student hand-ins) are in the storage folder, so copy that folder too when you move to another computer.
      </Alert>

      <div className="mb-5">
        <Select value={values.kind} onChange={(event) => update({ kind: event.target.value })} aria-label="Kind of backup" className="sm:w-60">
          <option value="">All backups</option>
          <option value="MANUAL">Made here</option>
          <option value="UPLOADED">Uploaded</option>
          <option value="PRE_RESTORE">Safety copies</option>
        </Select>
      </div>

      <QueryState
        query={query}
        skeleton={<RowsSkeleton rows={4} />}
        isEmpty={(data) => data.items.length === 0}
        empty={
          <EmptyState
            icon={<Archive />}
            title={values.kind ? 'No backup of this kind' : 'No backups yet'}
            description={values.kind ? 'Choose another kind to see the rest.' : 'Make your first backup now. It takes a few seconds.'}
            action={
              values.kind ? (
                <Button variant="outline" onClick={() => update({ kind: '' })}>
                  Show all backups
                </Button>
              ) : (
                <Button onClick={() => setCreating(true)} disabled={!canMake}>
                  <Plus /> Make a backup
                </Button>
              )
            }
          />
        }
      >
        {(data) => (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Backup</TH>
                  <TH>Kind</TH>
                  <TH>Made</TH>
                  <TH className="text-right">Size</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {data.items.map((backup) => (
                  <TR key={backup.id}>
                    <TD>
                      <p className="font-medium">{backup.displayName}</p>
                      {backup.note ? <p className="text-[0.8125rem] text-muted-foreground">{backup.note}</p> : null}
                      {!backup.fileExists ? <Badge tone="danger" className="mt-1">File is missing</Badge> : null}
                    </TD>
                    <TD>
                      <StatusBadge status={backup.kind} />
                    </TD>
                    <TD className="whitespace-nowrap text-[0.8125rem]">
                      {formatDateTime(backup.createdAt)}
                      <p className="text-muted-foreground">by {backup.createdByName}</p>
                    </TD>
                    <TD className="whitespace-nowrap text-right tabular-nums">{formatBytes(backup.sizeBytes)}</TD>
                    <TD>
                      <div className="flex justify-end gap-1.5">
                        <DownloadButton url={`/backups/${backup.id}/download`} fallbackName={`${backup.displayName}.dump`} size="sm" variant="outline">
                          Download
                        </DownloadButton>
                        <Button size="sm" variant="outline" disabled={!backup.fileExists || !tools?.toolsAvailable || tools.busy} onClick={() => setRestoring(backup)}>
                          <History /> Restore
                        </Button>
                        <Button size="icon-sm" variant="ghost" aria-label={`Delete ${backup.displayName}`} onClick={() => setRemoving(backup)}>
                          <Trash2 className="text-pen" />
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <Pagination meta={data.meta} onPage={setPage} />
          </>
        )}
      </QueryState>

      <CreateDialog open={creating} onOpenChange={setCreating} />
      <UploadDialog open={uploading} onOpenChange={setUploading} />
      <RestoreDialog backup={restoring} onClose={() => setRestoring(null)} />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Delete this backup?"
        description={removing ? `${removing.displayName} is removed from this computer for good. Your live data is not affected.` : ''}
        confirmLabel="Delete backup"
        tone="danger"
        pending={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing)}
      />
    </>
  );
}
