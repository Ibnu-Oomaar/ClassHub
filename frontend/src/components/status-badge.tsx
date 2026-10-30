import { Badge, type BadgeTone } from '@/components/ui/badge';
import { humanize } from '@/lib/format';

const TONES: Record<string, BadgeTone> = {
  ACTIVE: 'success',
  SUSPENDED: 'warning',
  DEACTIVATED: 'neutral',
  DRAFT: 'neutral',
  PENDING: 'neutral',
  SCHEDULED: 'primary',
  COMPLETED: 'success',
  CANCELLED: 'danger',
  SUBMITTED: 'primary',
  APPROVED: 'success',
  REJECTED: 'danger',
  GRADED: 'success',
  NOT_SUBMITTED: 'danger',
  OPEN: 'success',
  OVERDUE: 'warning',
  CLOSED: 'neutral',
  EXPIRED: 'neutral',
  MANUAL: 'primary',
  UPLOADED: 'neutral',
  PRE_RESTORE: 'warning',
};

const LABELS: Record<string, string> = {
  NOT_SUBMITTED: 'Not submitted',
  PENDING: 'Not started',
  DRAFT: 'Draft',
  PRE_RESTORE: 'Safety copy',
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={TONES[status] ?? 'neutral'}>{LABELS[status] ?? humanize(status)}</Badge>;
}
