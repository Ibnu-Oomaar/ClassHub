import type { ReactNode } from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/** A label, the control, an optional hint, and the validation message in the same place every time. */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="ml-0.5 text-pen" aria-hidden> *</span> : null}
      </Label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-[0.8125rem] font-medium text-pen">
          {error}
        </p>
      ) : hint ? (
        <p className="text-[0.8125rem] text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
