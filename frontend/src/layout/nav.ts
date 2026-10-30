import {
  Archive,
  BookOpenCheck,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FileBarChart,
  GraduationCap,
  History,
  Home,
  Megaphone,
  Percent,
  Settings,
  Trophy,
  UserRound,
  Users,
  BookMarked,
  type LucideIcon,
} from 'lucide-react';
import type { Role } from '@/auth/types';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

export interface NavGroup {
  label: string | null;
  items: NavItem[];
}

const dashboard: NavItem = { to: '/dashboard', label: 'Home', icon: Home };
const announcements: NavItem = { to: '/announcements', label: 'Announcements', icon: Megaphone };

export const NAVIGATION: Record<Role, NavGroup[]> = {
  CLASS_MASTER: [
    { label: null, items: [dashboard, announcements] },
    {
      label: 'People and subjects',
      items: [
        { to: '/students', label: 'Students', icon: GraduationCap },
        { to: '/teachers', label: 'Teachers', icon: Users },
        { to: '/subjects', label: 'Subjects', icon: BookMarked },
      ],
    },
    {
      label: 'Exams',
      items: [
        { to: '/examinations', label: 'Examinations', icon: CalendarDays },
        { to: '/marks-review', label: 'Marks review', icon: ClipboardCheck },
        { to: '/results', label: 'Results', icon: Trophy },
        { to: '/grading', label: 'Grading scales', icon: Percent },
      ],
    },
    { label: 'Coursework', items: [{ to: '/assignments', label: 'Assignments', icon: ClipboardList }] },
    {
      label: 'Administration',
      items: [
        { to: '/reports', label: 'Reports', icon: FileBarChart },
        { to: '/backups', label: 'Backups', icon: Archive },
        { to: '/audit-log', label: 'Audit log', icon: History },
        { to: '/settings', label: 'Settings', icon: Settings },
      ],
    },
  ],
  TEACHER: [
    { label: null, items: [dashboard, announcements] },
    {
      label: 'Teaching',
      items: [
        { to: '/examinations', label: 'Exams and marks', icon: ClipboardCheck },
        { to: '/assignments', label: 'Assignments', icon: ClipboardList },
        { to: '/students', label: 'Students', icon: GraduationCap },
        { to: '/reports', label: 'Reports', icon: FileBarChart },
      ],
    },
  ],
  STUDENT: [
    { label: null, items: [dashboard, announcements] },
    {
      label: 'My work',
      items: [
        { to: '/assignments', label: 'Assignments', icon: ClipboardList },
        { to: '/examinations', label: 'Exam timetable', icon: CalendarDays },
        { to: '/results', label: 'My results', icon: BookOpenCheck },
        { to: '/reports', label: 'My report', icon: FileBarChart },
      ],
    },
  ],
};

export const PROFILE_ITEM: NavItem = { to: '/profile', label: 'My account', icon: UserRound };
