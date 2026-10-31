import { useState } from 'react';
import { FileUp, Upload } from 'lucide-react';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { Spinner } from '@/components/states';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import type { MarkSheet } from '@/features/marks/types';
import { upload, post } from '@/lib/api';
import { formatScore, pluralize } from '@/lib/format';
import { keys } from '@/lib/query-keys';
import { useAction } from '@/lib/use-action';

interface PreviewRecord {
  studentId: string;
  score: string;
  recordNumber: number;
  matchedStudentName: string | null;
  currentScore: number | null;
  issues: string[];
  valid: boolean;
}

interface ImportPreview {
  maxMarks: number;
  records: PreviewRecord[];
  summary: {
    totalRecords: number;
    matchedRecords: number;
    validScores: number;
    invalidRecords: number;
    unknownStudentIds: number;
    duplicateStudentIds: number;
    overwrites: number;
  };
}

interface ImportConfirmation {
  entries: { studentCode: string; score: number; expectedCurrentScore: number | null }[];
  overwriteExisting: boolean;
}

export function MarksImportPanel({
  examinationSubjectId,
  disabled,
}: {
  examinationSubjectId: string;
  disabled: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [selectedRecords, setSelectedRecords] = useState<number[]>([]);
  const [confirming, setConfirming] = useState(false);

  const processDocument = useAction<File, ImportPreview>({
    run: (selectedFile) => upload<ImportPreview>(`/marks/examination-subjects/${examinationSubjectId}/import-preview`, selectedFile),
    success: 'Document processed. Review the records before importing.',
    onSuccess: (result) => {
      setPreview(result);
      setSelectedRecords(result.records.filter((record) => record.valid).map((record) => record.recordNumber));
    },
  });

  const confirmImport = useAction<ImportConfirmation, MarkSheet>({
    run: (body) => post<MarkSheet>(`/marks/examination-subjects/${examinationSubjectId}/import-confirm`, body),
    refresh: [keys.marks, keys.examinations, keys.dashboard],
    success: 'Marks imported into the existing score fields.',
    onSuccess: () => {
      setPreview(null);
      setSelectedRecords([]);
      setFile(null);
      setConfirming(false);
    },
  });

  const selected = preview?.records.filter((record) => selectedRecords.includes(record.recordNumber)) ?? [];
  const overwrites = selected.filter((record) => record.currentScore !== null);
  const isPending = processDocument.isPending || confirmImport.isPending;

  const updateSelection = (recordNumber: number, checked: boolean) => {
    setSelectedRecords((current) =>
      checked ? [...current, recordNumber] : current.filter((value) => value !== recordNumber),
    );
  };

  return (
    <section className="mb-5 rounded-xl border border-border bg-surface p-4 sm:p-5" aria-labelledby="marks-import-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 id="marks-import-title" className="font-display text-lg">Import marks</h2>
          <p className="mt-1 text-sm text-muted-foreground">Supported formats: PDF, Excel (.xlsx), and CSV. Required columns: Student ID and Score.</p>
        </div>
        <label className="flex min-w-0 flex-col gap-2 sm:w-96">
          <span className="text-sm font-medium">Choose a marks document</span>
          <input
            type="file"
            accept=".pdf,.xlsx,.csv,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={disabled || isPending}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setPreview(null);
              setSelectedRecords([]);
            }}
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-subtle file:px-3 file:py-2 file:font-medium file:text-foreground disabled:opacity-70"
            aria-label="Choose a PDF, .xlsx, or CSV marks document"
          />
        </label>
      </div>

      {disabled ? (
        <Alert tone="warning" className="mt-4">
          Save or discard your unsaved table edits before importing, so they are not replaced by the updated mark sheet.
        </Alert>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          disabled={!file || disabled || isPending}
          onClick={() => file && processDocument.mutate(file)}
        >
          {processDocument.isPending ? <Spinner /> : <FileUp />}
          Upload and preview
        </Button>
        {processDocument.isPending ? <span className="text-sm text-muted-foreground" role="status">Uploading and processing document…</span> : null}
      </div>

      {preview ? (
        <div className="mt-5 space-y-4">
          <div className="grid gap-2 rounded-lg bg-subtle/60 p-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <p>Total extracted: <strong>{preview.summary.totalRecords}</strong></p>
            <p>Successfully matched: <strong>{preview.summary.matchedRecords}</strong></p>
            <p>Valid scores: <strong>{preview.summary.validScores}</strong></p>
            <p>Invalid records: <strong>{preview.summary.invalidRecords}</strong></p>
            <p>Unknown Student IDs: <strong>{preview.summary.unknownStudentIds}</strong></p>
            <p>Duplicate Student IDs: <strong>{preview.summary.duplicateStudentIds}</strong></p>
            <p>Potential overwrites: <strong>{preview.summary.overwrites}</strong></p>
            <p>Selected for import: <strong>{selected.length}</strong></p>
          </div>

          {preview.summary.invalidRecords > 0 ? (
            <Alert tone="warning" title="Invalid records are excluded">
              Correct the source document and upload it again, or leave invalid records excluded. Valid records remain available for review.
            </Alert>
          ) : null}

          <div className="max-h-[28rem] overflow-auto rounded-lg border border-border">
            <Table>
              <THead>
                <TR>
                  <TH className="w-12">Import</TH>
                  <TH>Document Student ID</TH>
                  <TH>Matched student</TH>
                  <TH>Incoming score</TH>
                  <TH>Current score</TH>
                  <TH>Validation</TH>
                </TR>
              </THead>
              <TBody>
                {preview.records.map((record) => (
                  <TR key={record.recordNumber}>
                    <TD>
                      <Checkbox
                        checked={selectedRecords.includes(record.recordNumber)}
                        disabled={!record.valid || disabled || isPending}
                        onCheckedChange={(checked) => updateSelection(record.recordNumber, checked === true)}
                        aria-label={`Include record ${record.recordNumber} for ${record.studentId || 'missing Student ID'}`}
                      />
                    </TD>
                    <TD className="font-medium">{record.studentId || 'Missing'}</TD>
                    <TD>{record.matchedStudentName ?? 'No match'}</TD>
                    <TD className="tabular-nums">{record.score || 'Missing'}</TD>
                    <TD className="tabular-nums">
                      {record.currentScore === null ? '—' : (
                        <span className="font-medium text-pen">
                          {formatScore(record.currentScore)} → {record.score} (overwrite)
                        </span>
                      )}
                    </TD>
                    <TD>
                      {record.valid ? <span className="text-success">Valid</span> : (
                        <ul className="list-disc space-y-1 pl-4 text-pen">
                          {record.issues.map((issue) => <li key={issue}>{issue}</li>)}
                        </ul>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {selected.length > 0 ? `${pluralize(selected.length, 'record')} selected for import.` : 'Select at least one valid record.'}
              {overwrites.length > 0 ? ` ${pluralize(overwrites.length, 'existing score')} will be overwritten after confirmation.` : ''}
            </p>
            <Button disabled={selected.length === 0 || disabled || isPending} onClick={() => setConfirming(true)}>
              {confirmImport.isPending ? <Spinner /> : <Upload />}
              Confirm import
            </Button>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Import these scores?"
        description={
          overwrites.length > 0
            ? `${pluralize(selected.length, 'score')} will be saved. ${overwrites.length} existing ${overwrites.length === 1 ? 'score will' : 'scores will'} be replaced. The current and incoming values are shown in the preview.`
            : `${pluralize(selected.length, 'score')} will be saved to the existing Score column.`
        }
        confirmLabel={overwrites.length > 0 ? 'Confirm and overwrite' : 'Confirm import'}
        tone={overwrites.length > 0 ? 'danger' : 'default'}
        pending={confirmImport.isPending}
        onConfirm={() => confirmImport.mutate({
          entries: selected.map((record) => ({
            studentCode: record.studentId,
            score: Number(record.score),
            expectedCurrentScore: record.currentScore,
          })),
          overwriteExisting: overwrites.length > 0,
        })}
      />
    </section>
  );
}
