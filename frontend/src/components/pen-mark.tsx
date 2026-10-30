import { cn } from '@/lib/utils';
import { formatScore } from '@/lib/format';

/**
 * A grade as a teacher writes it: the letter circled in red pen. This is the one flourish of the
 * app, so it is used only where a grade is shown (results, marks, submissions).
 */
export function PenGrade({
  grade,
  size = 'md',
  className,
}: {
  grade: string | null | undefined;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  if (!grade) {
    return <span className="text-muted-foreground">-</span>;
  }
  const box = { sm: 'h-7 min-w-9 text-base', md: 'h-10 min-w-13 text-xl', lg: 'h-16 min-w-22 text-4xl' }[size];
  return (
    <span
      role="img"
      aria-label={`Grade ${grade}`}
      className={cn('relative inline-grid -rotate-3 place-items-center px-2 font-display leading-none text-pen', box, className)}
    >
      <svg viewBox="0 0 64 44" preserveAspectRatio="none" className="absolute inset-0 size-full overflow-visible" aria-hidden>
        <path
          d="M33 3.5C50 2.5 62 11 60.5 23C59 35 44 41.5 29 40.5C13 39.5 3.5 31 5 20.5C6.5 9.5 20 3 36 4.5C45 5.4 52 8.5 55.5 13"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span className="relative">{grade}</span>
    </span>
  );
}

/** A score as it is written beside work: red, underlined, with the maximum next to it. */
export function PenScore({
  score,
  max,
  size = 'md',
  className,
}: {
  score: number | null | undefined;
  max: number;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const text = { sm: 'text-base', md: 'text-2xl', lg: 'text-5xl' }[size];
  const small = { sm: 'text-xs', md: 'text-sm', lg: 'text-lg' }[size];
  if (score === null || score === undefined) {
    return <span className="text-muted-foreground">Not marked yet</span>;
  }
  return (
    <span className={cn('inline-flex items-baseline gap-1.5', className)}>
      <span className={cn('relative font-display leading-none text-pen', text)}>
        {formatScore(score)}
        <svg viewBox="0 0 60 6" preserveAspectRatio="none" className="absolute -bottom-1.5 left-[-4%] h-1.5 w-[108%]" aria-hidden>
          <path d="M1 4.5C14 1.5 34 2.5 59 1.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
      </span>
      <span className={cn('text-muted-foreground', small)}>out of {formatScore(max)}</span>
    </span>
  );
}
