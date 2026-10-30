import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { keys } from '@/lib/query-keys';
import type { Settings } from './types';

/** Class-wide settings. Every role may read them. */
export function useSettings() {
  return useQuery({ queryKey: keys.settings, queryFn: () => get<Settings>('/settings'), staleTime: 60_000 });
}
