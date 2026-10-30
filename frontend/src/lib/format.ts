import { format, formatDistanceToNowStrict, isValid, parseISO } from 'date-fns';

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const date = typeof value === 'string' ? parseISO(value) : value;
  return isValid(date) ? date : null;
}

/** 25 Oct 2026 */
export function formatDate(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? format(date, 'd MMM yyyy') : '-';
}

/** 25 Oct 2026, 14:30 */
export function formatDateTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  return date ? format(date, 'd MMM yyyy, HH:mm') : '-';
}

/** "3 hours ago" or "in 2 days". */
export function formatRelative(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return '-';
  const distance = formatDistanceToNowStrict(date);
  return date.getTime() > Date.now() ? `in ${distance}` : `${distance} ago`;
}

/** Scores keep at most 2 decimals and drop a pointless ".00". */
export function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return String(Number(value.toFixed(2)));
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  return `${formatScore(value)}%`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

/** "MIDTERM" -> "Midterm", "PRE_RESTORE" -> "Pre restore". */
export function humanize(value: string): string {
  const text = value.toLowerCase().replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/** Initials for an avatar: "Amina Yusuf" -> "AY". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** 1 -> "1st", 2 -> "2nd", 11 -> "11th", 23 -> "23rd". */
export function ordinal(value: number): string {
  const lastTwo = value % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${value}th`;
  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}

/** "Good morning" / "Good afternoon" / "Good evening" for the hour of day. */
export function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const TITLES = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'prof', 'eng', 'sheikh', 'shaikh', 'ustaad', 'ustaz', 'ustad', 'hajji']);

/**
 * What to call someone in a greeting. "Abdirahman Ahmed Ali" -> "Abdirahman"; a leading title stays with the
 * name that follows it, so "Mr Hassan Warsame" -> "Mr Hassan" instead of just "Mr".
 */
export function firstName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fullName;
  const [first, second] = parts;
  if (TITLES.has(first.toLowerCase().replace(/\.$/, '')) && second) return `${first} ${second}`;
  return first;
}
