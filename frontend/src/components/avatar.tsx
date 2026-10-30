import { useEffect, useState } from 'react';
import { fetchImage } from '@/lib/api';
import { initials } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Initials in a circle, or the person's photo when one was uploaded (photos need the session, so they are fetched with it). */
export function Avatar({
  name,
  photoUrl,
  className,
}: {
  name: string;
  /** API path of the photo, e.g. /students/:id/photo. Omit when the person has no photo. */
  photoUrl?: string | null;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!photoUrl) {
      setSrc(null);
      return;
    }
    let objectUrl: string | null = null;
    let cancelled = false;
    void fetchImage(photoUrl).then((url) => {
      if (cancelled) {
        if (url) URL.revokeObjectURL(url);
        return;
      }
      objectUrl = url;
      setSrc(url);
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photoUrl]);

  return (
    <span
      className={cn('inline-grid size-10 shrink-0 place-items-center overflow-hidden rounded-full bg-primary/14 text-sm font-semibold text-primary', className)}
      aria-hidden={!src}
    >
      {src ? <img src={src} alt={name} className="size-full object-cover" /> : initials(name)}
    </span>
  );
}
