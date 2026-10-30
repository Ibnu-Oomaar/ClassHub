import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';

interface ActionOptions<TVariables, TData> {
  run: (variables: TVariables) => Promise<TData>;
  /** Query keys (prefixes) that this change makes stale. */
  refresh?: QueryKey[];
  /** The message shown when it worked. */
  success?: string | ((data: TData, variables: TVariables) => string);
  /** Forms show the server's message next to the fields, so they turn the error toast off. */
  quiet?: boolean;
  onSuccess?: (data: TData, variables: TVariables) => void;
}

/** A write to the server: it refreshes the lists it changed and tells the person how it went. */
export function useAction<TVariables = void, TData = unknown>({ run, refresh = [], success, quiet = false, onSuccess }: ActionOptions<TVariables, TData>) {
  const queryClient = useQueryClient();
  return useMutation<TData, Error, TVariables>({
    mutationFn: run,
    onSuccess: async (data, variables) => {
      await Promise.all(refresh.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
      if (success) toast.success(typeof success === 'function' ? success(data, variables) : success);
      onSuccess?.(data, variables);
    },
    onError: (error) => {
      if (!quiet) toast.error(error.message);
    },
  });
}
