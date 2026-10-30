import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const fieldBase =
  'w-full rounded-lg border border-input bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground/80 transition-colors focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-ring disabled:cursor-not-allowed disabled:bg-subtle disabled:opacity-70 aria-invalid:border-pen aria-invalid:outline-pen';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, type = 'text', ...props },
  ref,
) {
  return <input ref={ref} type={type} className={cn(fieldBase, 'h-10', className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, rows = 4, ...props },
  ref,
) {
  return <textarea ref={ref} rows={rows} className={cn(fieldBase, 'min-h-20 py-2 leading-relaxed', className)} {...props} />;
});

/** A styled native select: reliable on phones, keyboard friendly and needs no extra code. */
export const Select = forwardRef<HTMLSelectElement, InputHTMLAttributes<HTMLSelectElement> & { children: React.ReactNode }>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select
        ref={ref}
        className={cn(
          fieldBase,
          'h-10 appearance-none bg-[length:1rem] bg-[right_0.75rem_center] bg-no-repeat pr-9',
          "bg-[url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2355627f' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")]",
          className,
        )}
        {...(props as object)}
      >
        {children}
      </select>
    );
  },
);
