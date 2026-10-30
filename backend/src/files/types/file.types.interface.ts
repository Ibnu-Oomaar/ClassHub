export enum FileCategory {
  PROFILE_PHOTO = 'PROFILE_PHOTO',
  ASSIGNMENT_ATTACHMENT = 'ASSIGNMENT_ATTACHMENT',
  SUBMISSION = 'SUBMISSION',
  REPORT = 'REPORT',
}

/** Where a stored file is attached. Set by the feature that owns the file. */
export enum FileOwnerType {
  USER_PROFILE = 'USER_PROFILE',
  ASSIGNMENT = 'ASSIGNMENT',
  SUBMISSION = 'SUBMISSION',
}

export interface FileView {
  id: string;
  category: FileCategory;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  attached: boolean;
  uploadedById: string | null;
  createdAt: Date;
}
