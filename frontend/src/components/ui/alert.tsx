import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

const STYLES = {
  info: { box: 'border-primary/30 bg-primary/8', icon: Info, color: 'text-primary' },
  success: { box: 'border-success/35 bg-success/10', icon: CheckCircle2, color: 'text-success' },
  warning: { box: 'border-highlight bg-highlight/20', icon: AlertTriangle, color: 'text-foreground' },
  danger: { box: 'border-pen/40 bg-pen/8', icon: XCircle, color: 'text-pen' },
} as const;

export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: keyof typeof STYLES;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const style = STYLES[tone];
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex gap-3 rounded-xl border px-4 py-3 text-sm', style.box, className)}>
      <style.icon className={cn('mt-0.5 size-4 shrink-0', style.color)} aria-hidden />
      <div className="min-w-0">
        {title ? <p className="font-medium">{title}</p> : null}
        {children ? <div className={cn(title && 'mt-0.5', 'text-foreground/85')}>{children}</div> : null}
      </div>
    </div>
  );
}
