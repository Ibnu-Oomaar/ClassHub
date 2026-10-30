/** Who an announcement is for. The Class Master always sees every announcement. */
export enum AnnouncementAudience {
  ALL = 'ALL',
  TEACHERS = 'TEACHERS',
  STUDENTS = 'STUDENTS',
}

/**
 * DRAFT: not published. SCHEDULED is not a state: an announcement is visible from the moment it is published.
 * EXPIRED: published but past its expiry. ACTIVE: published and not expired.
 */
export type AnnouncementState = 'DRAFT' | 'ACTIVE' | 'EXPIRED';

export interface AnnouncementView {
  id: string;
  title: string;
  body: string;
  audience: AnnouncementAudience;
  isPinned: boolean;
  isPublished: boolean;
  state: AnnouncementState;
  publishedAt: Date | null;
  expiresAt: Date | null;
  authorName: string;
  createdAt: Date;
  updatedAt: Date;
}
