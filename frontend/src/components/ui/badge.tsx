import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', {
  variants: {
    tone: {
      neutral: 'bg-subtle text-muted-foreground border border-border',
      primary: 'bg-primary/12 text-primary border border-primary/25',
      success: 'bg-success/12 text-success border border-success/30',
      warning: 'bg-highlight/35 text-foreground border border-highlight',
      danger: 'bg-pen/12 text-pen border border-pen/30',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>['tone']>;

export function Badge({ className, tone, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}
