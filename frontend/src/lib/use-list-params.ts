import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * List screens keep their page, search and filters in the address bar, so a refresh, the back button
 * and a shared link all land on the same view. Changing a filter returns to page 1.
 */
export function useListParams<T extends Record<string, string>>(defaults: T) {
  const [search, setSearch] = useSearchParams();

  const values = useMemo(() => {
    const result = { ...defaults } as Record<string, string>;
    for (const key of Object.keys(defaults)) {
      const value = search.get(key);
      if (value !== null) result[key] = value;
    }
    return result as T;
  }, [defaults, search]);

  const page = Math.max(1, Number.parseInt(search.get('page') ?? '1', 10) || 1);

  const update = useCallback(
    (patch: Partial<T>, options: { keepPage?: boolean } = {}) => {
      setSearch(
        (current) => {
          const next = new URLSearchParams(current);
          for (const [key, value] of Object.entries(patch)) {
            if (value === undefined || value === '' || value === defaults[key]) next.delete(key);
            else next.set(key, String(value));
          }
          if (!options.keepPage) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [defaults, setSearch],
  );

  const setPage = useCallback(
    (nextPage: number) => {
      setSearch(
        (current) => {
          const next = new URLSearchParams(current);
          if (nextPage <= 1) next.delete('page');
          else next.set('page', String(nextPage));
          return next;
        },
        { replace: true },
      );
    },
    [setSearch],
  );

  return { values, page, update, setPage };
}
