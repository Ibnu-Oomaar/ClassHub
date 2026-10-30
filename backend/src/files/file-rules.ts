import { extname } from 'node:path';
import { Role } from '../common/enums/role.enum';
import { FileCategory } from './types/file.types.interface';

export type StorageDirectory = 'profiles' | 'assignments' | 'submissions' | 'reports' | 'backups';

export const STORAGE_DIRECTORIES: StorageDirectory[] = ['profiles', 'assignments', 'submissions', 'reports', 'backups'];

interface FileTypeRule {
  mimeType: string;
  extensions: string[];
  /** Verifies the real content (magic bytes), not just the name the client sent. */
  matches: (buffer: Buffer) => boolean;
}

const startsWith =
  (...bytes: number[]) =>
  (buffer: Buffer): boolean =>
    buffer.length >= bytes.length && bytes.every((byte, index) => buffer[index] === byte);

const isZip = startsWith(0x50, 0x4b, 0x03, 0x04);
const isOle = startsWith(0xd0, 0xcf, 0x11, 0xe0);
const isPdf = startsWith(0x25, 0x50, 0x44, 0x46); // %PDF
const isText = (buffer: Buffer): boolean => !buffer.subarray(0, 8000).includes(0);
const isWebp = (buffer: Buffer): boolean =>
  buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP';

const FILE_TYPES: FileTypeRule[] = [
  { mimeType: 'image/jpeg', extensions: ['.jpg', '.jpeg'], matches: startsWith(0xff, 0xd8, 0xff) },
  { mimeType: 'image/png', extensions: ['.png'], matches: startsWith(0x89, 0x50, 0x4e, 0x47) },
  { mimeType: 'image/webp', extensions: ['.webp'], matches: isWebp },
  { mimeType: 'application/pdf', extensions: ['.pdf'], matches: isPdf },
  {
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    extensions: ['.docx'],
    matches: isZip,
  },
  {
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extensions: ['.xlsx'],
    matches: isZip,
  },
  {
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    extensions: ['.pptx'],
    matches: isZip,
  },
  { mimeType: 'application/msword', extensions: ['.doc'], matches: isOle },
  { mimeType: 'application/vnd.ms-excel', extensions: ['.xls'], matches: isOle },
  { mimeType: 'application/vnd.ms-powerpoint', extensions: ['.ppt'], matches: isOle },
  { mimeType: 'application/zip', extensions: ['.zip'], matches: isZip },
  { mimeType: 'text/plain', extensions: ['.txt'], matches: isText },
  { mimeType: 'text/csv', extensions: ['.csv'], matches: isText },
];

export interface DetectedFileType {
  mimeType: string;
  extension: string;
}

/**
 * Identifies a file from its extension AND its leading bytes. The MIME type sent by the
 * browser is ignored because it is trivially spoofed.
 */
export function detectFileType(originalName: string, buffer: Buffer): DetectedFileType | null {
  const extension = extname(originalName).toLowerCase();
  const rule = FILE_TYPES.find((candidate) => candidate.extensions.includes(extension) && candidate.matches(buffer));
  return rule ? { mimeType: rule.mimeType, extension } : null;
}

export interface CategoryRule {
  directory: StorageDirectory;
  allowedMimeTypes: string[];
  maxBytes?: number;
  /** Roles allowed to upload this category through POST /files/upload. */
  uploadRoles: Role[];
  label: string;
}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const DOCUMENT_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.ms-excel',
  'application/vnd.ms-powerpoint',
  'application/zip',
  'text/plain',
  'text/csv',
  ...IMAGE_TYPES,
];

export const CATEGORY_RULES: Record<FileCategory, CategoryRule> = {
  [FileCategory.PROFILE_PHOTO]: {
    directory: 'profiles',
    allowedMimeTypes: IMAGE_TYPES,
    maxBytes: 3 * 1024 * 1024,
    uploadRoles: [Role.CLASS_MASTER],
    label: 'profile photo (JPG, PNG or WEBP, up to 3 MB)',
  },
  [FileCategory.ASSIGNMENT_ATTACHMENT]: {
    directory: 'assignments',
    allowedMimeTypes: DOCUMENT_TYPES,
    uploadRoles: [Role.TEACHER],
    label: 'assignment attachment (PDF, Office, text, image or ZIP)',
  },
  [FileCategory.SUBMISSION]: {
    directory: 'submissions',
    allowedMimeTypes: DOCUMENT_TYPES,
    uploadRoles: [Role.STUDENT],
    label: 'submission file (PDF, Office, text, image or ZIP)',
  },
  [FileCategory.REPORT]: {
    directory: 'reports',
    allowedMimeTypes: ['application/pdf', 'text/csv'],
    uploadRoles: [],
    label: 'generated report',
  },
};

/** Safe display name: no path parts, no control characters, bounded length. */
export function sanitizeDisplayName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f"<>|:*?]/g, '').trim();
  return cleaned.slice(0, 150) || 'file';
}

/**
 * Browsers send UTF-8 names that multer may decode as latin1 ("Ã©" instead of "é").
 * Re-decode when that is clearly what happened.
 */
export function repairFilenameEncoding(name: string): string {
  if (!/[\u0080-ÿ]/.test(name)) {
    return name;
  }
  const redecoded = Buffer.from(name, 'latin1').toString('utf8');
  return redecoded.includes('�') ? name : redecoded;
}
