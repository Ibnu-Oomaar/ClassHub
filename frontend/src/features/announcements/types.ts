export type Audience = 'ALL' | 'TEACHERS' | 'STUDENTS';
export type AnnouncementState = 'DRAFT' | 'ACTIVE' | 'EXPIRED';

export const AUDIENCE_LABEL: Record<Audience, string> = {
  ALL: 'Everyone',
  TEACHERS: 'Teachers only',
  STUDENTS: 'Students only',
};

export interface Announcement {
  id: string;
  title: string;
  body: string;
  audience: Audience;
  isPinned: boolean;
  isPublished: boolean;
  state: AnnouncementState;
  publishedAt: string | null;
  expiresAt: string | null;
  authorName: string;
  createdAt: string;
  updatedAt: string;
}
