/** Why a backup exists. */
export enum BackupKind {
  /** The Class Master pressed "Create backup". */
  MANUAL = 'MANUAL',
  /** A backup file the Class Master uploaded (for example from another computer). */
  UPLOADED = 'UPLOADED',
  /** Taken automatically right before a restore, so a restore can always be undone. */
  PRE_RESTORE = 'PRE_RESTORE',
}

export interface BackupView {
  id: string;
  displayName: string;
  kind: BackupKind;
  note: string | null;
  sizeBytes: number;
  checksumSha256: string;
  createdByName: string;
  createdAt: Date;
  /** False when the file was removed from the backups folder behind the application's back. */
  fileExists: boolean;
}

export interface BackupStatusView {
  toolsAvailable: boolean;
  pgDumpVersion: string | null;
  pgRestoreVersion: string | null;
  /** Human-readable reason when the tools are not usable (what to install or configure). */
  toolsProblem: string | null;
  busy: boolean;
  total: number;
  totalSizeBytes: number;
  latestBackupAt: Date | null;
}

export interface RestoreOutcome {
  restoredFrom: BackupView;
  /** The safety copy taken just before the restore. Restoring it undoes this restore. */
  safetyBackup: BackupView;
  warnings: string[];
}

/** Small file stored next to each backup so the list can be rebuilt if the database record is lost. */
export interface BackupSidecar {
  displayName: string;
  kind: BackupKind;
  note: string | null;
  sizeBytes: number;
  checksumSha256: string;
  createdByName: string;
  createdAt: string;
}
