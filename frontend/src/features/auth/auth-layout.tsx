import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ThemeToggle } from '@/components/theme-toggle';
import { BrandMark, ClassSticker } from '@/layout/brand';

/**
 * The page every sign-in and setup screen sits on: one sheet of exercise-book paper with a red
 * margin line, and the heading written on the first ruled line.
 */
export function AuthLayout({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="grid min-h-dvh place-items-center bg-background px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-5 flex items-center justify-between">
          <Link to="/login" className="rounded-md">
            <BrandMark />
          </Link>
          <ThemeToggle />
        </div>

        <div className="margin-line overflow-hidden rounded-2xl border border-border bg-surface shadow-sheet">
          <div className="ruled px-8 pb-2 pt-6 sm:pl-10">
            <ClassSticker className="mb-3 inline-block" />
            <h1 className="text-[1.75rem] leading-8">{title}</h1>
            {description ? <p className="mt-2 text-sm leading-8 text-muted-foreground">{description}</p> : null}
          </div>
          <div className="px-8 pb-8 pt-6 sm:pl-10">{children}</div>
        </div>

        {footer ? <div className="mt-5 text-center text-sm text-muted-foreground">{footer}</div> : null}
      </div>
    </div>
  );
}
