import { Toaster as Sonner } from 'sonner';
import { useTheme } from '@/components/theme-provider';

export function Toaster() {
  const { theme } = useTheme();
  return (
    <Sonner
      theme={theme}
      position="bottom-right"
      closeButton
      toastOptions={{
        classNames: {
          toast: '!rounded-xl !border !border-border !bg-surface !text-foreground !shadow-sheet !font-sans',
          description: '!text-muted-foreground',
        },
      }}
    />
  );
}
