import { ImagePlus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Avatar } from '@/components/avatar';
import { Spinner } from '@/components/states';
import { Button } from '@/components/ui/button';
import { upload } from '@/lib/api';
import { formatBytes } from '@/lib/format';

const MAX_BYTES = 3 * 1024 * 1024;
const ACCEPT = 'image/jpeg,image/png,image/webp';

interface UploadedFile {
  id: string;
}

/**
 * Chooses a profile photo. The picture is sent to the server as soon as it is chosen; the form then
 * saves only the id of the stored file. `value` is undefined until the person changes anything, null
 * when they removed the photo, and the file id when they picked a new one.
 */
export function PhotoPicker({
  name,
  currentPhotoUrl,
  value,
  onChange,
}: {
  name: string;
  /** API path of the photo the person has now, if any. */
  currentPhotoUrl?: string | null;
  value: string | null | undefined;
  onChange: (fileId: string | null | undefined) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setProblem(null);
    if (!ACCEPT.split(',').includes(file.type)) {
      setProblem('Choose a JPG, PNG or WEBP picture.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setProblem(`That picture is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_BYTES)}.`);
      return;
    }
    setBusy(true);
    try {
      const stored = await upload<UploadedFile>('/files/upload', file, { category: 'PROFILE_PHOTO' });
      setPreview(URL.createObjectURL(file));
      onChange(stored.id);
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'The picture could not be uploaded.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  const hasPhoto = value === undefined ? Boolean(currentPhotoUrl) : value !== null;
  const showCurrent = value === undefined ? currentPhotoUrl : null;

  return (
    <div className="flex items-center gap-4">
      {preview && value ? (
        <span className="inline-grid size-16 shrink-0 overflow-hidden rounded-full">
          <img src={preview} alt="" className="size-full object-cover" />
        </span>
      ) : (
        <Avatar name={name || '?'} photoUrl={showCurrent} className="size-16 text-lg" />
      )}
      <div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()} disabled={busy}>
            {busy ? <Spinner /> : <ImagePlus />}
            {hasPhoto ? 'Change photo' : 'Add photo'}
          </Button>
          {hasPhoto ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                setPreview(null);
                onChange(null);
              }}
            >
              <Trash2 /> Remove
            </Button>
          ) : null}
        </div>
        <p className="mt-1.5 text-[0.8125rem] text-muted-foreground">JPG, PNG or WEBP, up to 3 MB. Optional.</p>
        {problem ? (
          <p role="alert" className="mt-1 text-[0.8125rem] font-medium text-pen">
            {problem}
          </p>
        ) : null}
      </div>
      <input ref={input} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} aria-label="Choose a profile photo" onChange={(event) => void choose(event.target.files?.[0])} />
    </div>
  );
}
