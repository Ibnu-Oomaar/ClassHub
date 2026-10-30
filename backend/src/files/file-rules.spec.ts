import { Role } from '../common/enums/role.enum';
import { CATEGORY_RULES, detectFileType, repairFilenameEncoding, sanitizeDisplayName } from './file-rules';
import { FileCategory } from './types/file.types.interface';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const PDF = Buffer.from('%PDF-1.7\n');
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]);
const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP')]);

describe('detectFileType', () => {
  it('accepts a file whose name and content agree', () => {
    expect(detectFileType('photo.png', PNG)).toEqual({ mimeType: 'image/png', extension: '.png' });
    expect(detectFileType('photo.JPG', JPEG)).toEqual({ mimeType: 'image/jpeg', extension: '.jpg' });
    expect(detectFileType('photo.webp', WEBP)).toEqual({ mimeType: 'image/webp', extension: '.webp' });
    expect(detectFileType('work.pdf', PDF)?.mimeType).toBe('application/pdf');
    expect(detectFileType('work.docx', ZIP)?.mimeType).toContain('wordprocessingml');
    expect(detectFileType('old.doc', OLE)?.mimeType).toBe('application/msword');
    expect(detectFileType('files.zip', ZIP)?.mimeType).toBe('application/zip');
    expect(detectFileType('notes.txt', Buffer.from('plain text'))?.mimeType).toBe('text/plain');
    expect(detectFileType('marks.csv', Buffer.from('a,b\n1,2'))?.mimeType).toBe('text/csv');
  });

  it('rejects a file whose content is not what its name says', () => {
    expect(detectFileType('photo.png', PDF)).toBeNull();
    expect(detectFileType('work.pdf', PNG)).toBeNull();
    expect(detectFileType('fake.docx', Buffer.from('MZ not a zip'))).toBeNull();
  });

  it('rejects binary content pretending to be text', () => {
    expect(detectFileType('notes.txt', Buffer.from([0x41, 0x00, 0x42]))).toBeNull();
  });

  it('rejects types that are not allowed at all, whatever the content', () => {
    expect(detectFileType('run.exe', Buffer.from('MZ'))).toBeNull();
    expect(detectFileType('page.html', Buffer.from('<html>'))).toBeNull();
    expect(detectFileType('noextension', PNG)).toBeNull();
  });
});

describe('upload categories', () => {
  it('lets only the right role upload each kind of file', () => {
    expect(CATEGORY_RULES[FileCategory.PROFILE_PHOTO].uploadRoles).toEqual([Role.CLASS_MASTER]);
    expect(CATEGORY_RULES[FileCategory.ASSIGNMENT_ATTACHMENT].uploadRoles).toEqual([Role.TEACHER]);
    expect(CATEGORY_RULES[FileCategory.SUBMISSION].uploadRoles).toEqual([Role.STUDENT]);
    expect(CATEGORY_RULES[FileCategory.REPORT].uploadRoles).toEqual([]);
  });

  it('allows only pictures as profile photos, up to 3 MB', () => {
    const rule = CATEGORY_RULES[FileCategory.PROFILE_PHOTO];
    expect(rule.allowedMimeTypes).toEqual(['image/jpeg', 'image/png', 'image/webp']);
    expect(rule.maxBytes).toBe(3 * 1024 * 1024);
  });
});

describe('sanitizeDisplayName', () => {
  it('drops any folder part so a name cannot point somewhere else', () => {
    expect(sanitizeDisplayName('a/b/c.pdf')).toBe('c.pdf');
    expect(sanitizeDisplayName('..\\..\\secret.txt')).toBe('secret.txt');
  });

  it('removes control and unsafe characters', () => {
    expect(sanitizeDisplayName('re<po>rt\u0000"1".pdf')).toBe('report1.pdf');
  });

  it('falls back to a plain name and bounds the length', () => {
    expect(sanitizeDisplayName('')).toBe('file');
    expect(sanitizeDisplayName('///')).toBe('file');
    expect(sanitizeDisplayName('x'.repeat(400))).toHaveLength(150);
  });
});

describe('repairFilenameEncoding', () => {
  it('repairs UTF-8 names that were read as latin1', () => {
    const mangled = Buffer.from('Résumé.pdf', 'utf8').toString('latin1');
    expect(mangled).not.toBe('Résumé.pdf');
    expect(repairFilenameEncoding(mangled)).toBe('Résumé.pdf');
  });

  it('leaves plain names and genuine latin1 names alone', () => {
    expect(repairFilenameEncoding('report.pdf')).toBe('report.pdf');
    expect(repairFilenameEncoding('café.pdf')).toBe('café.pdf');
  });
});
