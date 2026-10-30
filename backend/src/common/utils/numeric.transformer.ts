import { ValueTransformer } from 'typeorm';

/**
 * PostgreSQL returns `numeric` columns as strings. This converts them to JS numbers
 * so scores and percentages can be compared and summed safely.
 */
export const numericTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | number | null) =>
    value === null || value === undefined ? null : typeof value === 'number' ? value : parseFloat(value),
};

/** Same idea for `bigint` columns (file sizes). */
export const bigintTransformer: ValueTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | number | null) =>
    value === null || value === undefined ? null : typeof value === 'number' ? value : parseInt(value, 10),
};
