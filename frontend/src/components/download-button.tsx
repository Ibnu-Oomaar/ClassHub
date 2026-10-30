import { Download } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Spinner } from '@/components/states';
import { Button, type ButtonProps } from '@/components/ui/button';
import { download, type Query } from '@/lib/api';

/** Downloads a file from the server with the signed-in session and reports a failure in a toast. */
export function DownloadButton({
  url,
  params,
  fallbackName,
  children,
  variant = 'outline',
  size = 'md',
  onDone,
}: {
  url: string;
  params?: Query;
  fallbackName: string;
  children: ReactNode;
  variant?: ButtonProps['variant'];
  size?: ButtonProps['size'];
  onDone?: (fileName: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const name = await download(url, params, fallbackName);
          onDone?.(name);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'The download failed.');
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? <Spinner /> : <Download />}
      {children}
    </Button>
  );
}
