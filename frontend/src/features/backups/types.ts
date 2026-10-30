export type BackupKind = 'MANUAL' | 'UPLOADED' | 'PRE_RESTORE';

export interface Backup {
  id: string;
  displayName: string;
  kind: BackupKind;
  note: string | null;
  sizeBytes: number;
  checksumSha256: string;
  createdByName: string;
  createdAt: string;
  fileExists: boolean;
}

export interface BackupStatus {
  toolsAvailable: boolean;
  pgDumpVersion: string | null;
  pgRestoreVersion: string | null;
  toolsProblem: string | null;
  busy: boolean;
  total: number;
  totalSizeBytes: number;
  latestBackupAt: string | null;
}

export interface RestoreOutcome {
  restoredFrom: Backup;
  safetyBackup: Backup;
  warnings: string[];
}
