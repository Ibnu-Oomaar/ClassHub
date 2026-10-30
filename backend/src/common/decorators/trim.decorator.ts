import { Transform } from 'class-transformer';

/** Trims surrounding whitespace from string inputs. */
export const Trim = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

/** Trims strings and turns empty strings into null (used for optional, clearable fields). */
export const TrimToNull = () =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  });
