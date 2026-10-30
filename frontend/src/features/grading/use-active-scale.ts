import { useQuery } from '@tanstack/react-query';
import { get } from '@/lib/api';
import { keys } from '@/lib/query-keys';
import type { GradingScale } from './types';

/** The grading scale in use, or null when the Class Master has not activated one. Every role may read it. */
export function useActiveScale() {
  return useQuery({ queryKey: [...keys.grading, 'active'], queryFn: () => get<GradingScale | null>('/grading/active'), staleTime: 60_000 });
}
