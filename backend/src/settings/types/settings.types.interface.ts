/** CLASSHUB is built for exactly one class. */
export const CLASS_NAME = '3C Morning Boys';

export interface SettingsView {
  className: string;
  academicYear: string | null;
  currentPeriod: string | null;
  /** Global switch: when off, students cannot submit assignments. */
  studentSubmissionsEnabled: boolean;
  setupCompleted: boolean;
  setupCompletedAt: Date | null;
  updatedAt: Date | null;
}
