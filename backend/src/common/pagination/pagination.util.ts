import { PaginationMeta } from './paginated.interface';

/**
 * Returned by services/controllers for list endpoints.
 * ResponseInterceptor turns it into `{ success, data: items, meta }`.
 */
export class Paginated<T> {
  constructor(
    public readonly items: T[],
    public readonly meta: PaginationMeta,
  ) {}
}

export function buildPaginated<T>(items: T[], total: number, page: number, limit: number): Paginated<T> {
  return new Paginated(items, {
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
}

export function skipFor(page: number, limit: number): number {
  return (page - 1) * limit;
}
