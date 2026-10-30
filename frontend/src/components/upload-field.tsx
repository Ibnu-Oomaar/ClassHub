import { Paperclip, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { Spinner } from '@/components/states';
import { Button } from '@/components/ui/button';
import { upload } from '@/lib/api';
import { formatBytes } from '@/lib/format';

export interface UploadedItem {
  id: string;
  name: string;
  sizeBytes: number;
}

interface StoredFile {
  id: string;
  originalName: string;
  sizeBytes: number;
}

/**
 * Attaches files to a form. Each file is sent to the server as soon as it is chosen, and the form
 * keeps only the ids. The server checks the real type and size and replies with a plain message.
 */
export function UploadField({
  category,
  items,
  onChange,
  max = 1,
  label = 'Attach a file',
  hint,
  disabled = false,
}: {
  category: 'ASSIGNMENT_ATTACHMENT' | 'SUBMISSION';
  items: UploadedItem[];
  onChange: (items: UploadedItem[]) => void;
  max?: number;
  label?: string;
  hint?: string;
  disabled?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const choose = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setProblem(null);
    setBusy(true);
    let next = items;
    try {
      for (const file of Array.from(files)) {
        if (next.length >= max) {
          setProblem(max === 1 ? 'Only one file can be attached.' : `You can attach at most ${max} files.`);
          break;
        }
        const stored = await upload<StoredFile>('/files/upload', file, { category });
        next = [...next, { id: stored.id, name: stored.originalName, sizeBytes: stored.sizeBytes }];
        onChange(next);
      }
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'The file could not be uploaded.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const full = items.length >= max;

  return (
    <div>
      {items.length > 0 ? (
        <ul className="mb-2 divide-y divide-border rounded-lg border border-border">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <Paperclip className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              <span className="shrink-0 text-[0.8125rem] text-muted-foreground">{formatBytes(item.sizeBytes)}</span>
              <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${item.name}`} disabled={busy || disabled} onClick={() => onChange(items.filter((other) => other.id !== item.id))}>
                <X />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <Button type="button" variant="outline" size="sm" disabled={busy || full || disabled} onClick={() => input.current?.click()}>
        {busy ? <Spinner /> : <Paperclip />}
        {busy ? 'Uploading' : full && max === 1 ? 'File attached' : label}
      </Button>
      {hint ? <p className="mt-1.5 text-[0.8125rem] text-muted-foreground">{hint}</p> : null}
      {problem ? (
        <p role="alert" className="mt-1.5 text-[0.8125rem] font-medium text-pen">
          {problem}
        </p>
      ) : null}
      <input ref={input} type="file" multiple={max > 1} className="sr-only" tabIndex={-1} aria-label={label} onChange={(event) => void choose(event.target.files)} />
    </div>
  );
}
