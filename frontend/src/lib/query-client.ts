import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api';

/** Lists are cached for a short while so moving between pages feels instant; writes invalidate what they change. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 20_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // A request the server understood and refused will be refused again: only retry network trouble.
        if (error instanceof ApiError && error.status !== 0 && error.status < 500) return false;
        return failureCount < 2;
      },
    },
  },
});
