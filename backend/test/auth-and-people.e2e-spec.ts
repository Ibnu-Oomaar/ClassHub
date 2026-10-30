import { Api, expectStatus, SMALL_PNG, uploadForm } from './support/api';
import { createTestApp, TestApp } from './support/test-app';

describe('First-run setup, sign-in, people and permissions', () => {
  let t: TestApp;
  let api: Api;

  let cm: string;
  let teacherToken: string;
  let studentToken: string;
  let physics: string;
  let arabic: string;
  let teacherId: string;
  let studentId: string;
  let student2: string;
  let assignmentLinkId: string;
  let wrongPasswordMessage: string;
  let studentFailureMessage: string;

  const setupBody = { fullName: 'Amina Yusuf', username: 'classmaster', email: 'amina@example.com', password: 'Secret123', confirmPassword: 'Secret123' };

  beforeAll(async () => {
    t = await createTestApp(1);
    api = t.api;
  });

  afterAll(async () => {
    await t.close();
  });

  describe('an empty system', () => {
    it('starts with no data in any table: nothing is seeded', async () => {
      for (const table of ['users', 'students', 'teachers', 'subjects', 'examinations', 'grading_scales', 'assignments', 'announcements']) {
        const [row] = await t.sql(`select count(*)::int as n from ${table}`);
        expect({ table, rows: row.n }).toEqual({ table, rows: 0 });
      }
    });

    it('reports that setup is not done yet', async () => {
      const r = await api.get('/setup/status');
      expectStatus(r, 200);
      expect(r.json.data.setupCompleted).toBe(false);
    });

    it('rejects requests without a token', async () => {
      expect((await api.get('/students')).status).toBe(401);
    });
  });

  describe('the one-time setup wizard', () => {
    it('refuses mismatched passwords', async () => {
      const r = await api.post('/setup/initial', undefined, { ...setupBody, confirmPassword: 'Different1' });
      expect(r.status).toBe(400);
    });

    it('refuses a weak password', async () => {
      const r = await api.post('/setup/initial', undefined, { ...setupBody, password: 'short', confirmPassword: 'short' });
      expect(r.status).toBe(400);
    });

    it('lets exactly one of several simultaneous requests create the Class Master', async () => {
      const results = await Promise.all(Array.from({ length: 6 }, () => api.post('/setup/initial', undefined, setupBody)));
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 403, 403, 403, 403, 403]);
      const [row] = await t.sql("select count(*)::int as n from users where role = 'CLASS_MASTER'");
      expect(row.n).toBe(1);
    });

    it('is switched off once it has been completed', async () => {
      expect((await api.post('/setup/initial', undefined, setupBody)).status).toBe(403);
      const r = await api.get('/setup/status');
      expect(r.json.data.setupCompleted).toBe(true);
    });
  });

  describe('Class Master sign-in', () => {
    it('refuses a wrong password', async () => {
      const r = await api.post('/auth/class-master-login', undefined, { identifier: 'classmaster', password: 'WrongPass1' });
      expect(r.status).toBe(401);
      wrongPasswordMessage = r.json.message;
    });

    it('gives an unknown user exactly the same answer, so accounts cannot be guessed', async () => {
      const r = await api.post('/auth/class-master-login', undefined, { identifier: 'nobody', password: 'WrongPass1' });
      expect(r.status).toBe(401);
      expect(r.json.message).toBe(wrongPasswordMessage);
    });

    it('accepts the email address, whatever its letter case', async () => {
      const r = await api.post('/auth/class-master-login', undefined, { identifier: 'AMINA@example.com', password: 'Secret123' });
      expectStatus(r, 200);
      cm = r.json.data.accessToken;
      expect(cm).toBeTruthy();
      expect(JSON.stringify(r.json)).not.toContain('passwordHash');
    });

    it('does not accept the Class Master on the teacher sign-in', async () => {
      const r = await api.post('/auth/teacher-login', undefined, { identifier: 'classmaster', password: 'Secret123' });
      expect(r.status).toBe(401);
    });

    it('has no self-registration endpoint', async () => {
      for (const path of ['/auth/register', '/auth/signup', '/users']) {
        const r = await api.post(path, undefined, { fullName: 'Hacker', username: 'hacker', password: 'Hacker123' });
        expect([401, 404]).toContain(r.status);
      }
    });
  });

  describe('the Class Master creates subjects, teachers and students', () => {
    it('creates a subject, trimming the name and upper-casing the code', async () => {
      const r = await api.post('/subjects', cm, { name: '  Physics ', code: 'phy' });
      expectStatus(r, 201);
      expect(r.json.data).toMatchObject({ name: 'Physics', code: 'PHY', teachers: [] });
      physics = r.json.data.id;
    });

    it('treats subject names as unique whatever the letter case', async () => {
      expect((await api.post('/subjects', cm, { name: 'physics' })).status).toBe(409);
    });

    it('creates a second subject', async () => {
      const r = await api.post('/subjects', cm, { name: 'Arabic' });
      expectStatus(r, 201);
      arabic = r.json.data.id;
    });

    it('creates a teacher', async () => {
      const r = await api.post('/teachers', cm, { fullName: 'Mohamed Hassan', username: 'm.hassan', password: 'Teach1234', phone: '+252 63 4000000', notes: 'private note' });
      expectStatus(r, 201);
      expect(r.json.data.status).toBe('ACTIVE');
      teacherId = r.json.data.id;
    });

    it('requires a teacher to have a username or an email', async () => {
      expect((await api.post('/teachers', cm, { fullName: 'No Login', password: 'Teach1234' })).status).toBe(400);
    });

    it('treats teacher usernames as unique whatever the letter case', async () => {
      expect((await api.post('/teachers', cm, { fullName: 'Dup Name', username: 'M.HASSAN', password: 'Teach1234' })).status).toBe(409);
    });

    it('creates a student, normalising the Student ID and collapsing spaces in the name', async () => {
      const r = await api.post('/students', cm, { fullName: 'Abdirahman  Ahmed Ali', studentId: ' st-001 ', gender: 'MALE', dateOfBirth: '2010-05-14', phone: '+252 63 1111111', notes: 'private student note' });
      expectStatus(r, 201);
      expect(r.json.data).toMatchObject({ studentId: 'ST-001', fullName: 'Abdirahman Ahmed Ali' });
      studentId = r.json.data.id;
    });

    it('refuses a duplicate Student ID', async () => {
      expect((await api.post('/students', cm, { fullName: 'Someone Else', studentId: 'ST-001' })).status).toBe(409);
    });

    it('refuses a date of birth in the future', async () => {
      expect((await api.post('/students', cm, { fullName: 'Bad Date', studentId: 'ST-009', dateOfBirth: '2999-01-01' })).status).toBe(400);
    });

    it('rejects fields it does not know, such as a role', async () => {
      expect((await api.post('/students', cm, { fullName: 'Extra', studentId: 'ST-010', role: 'CLASS_MASTER' })).status).toBe(400);
    });

    it('creates a second student', async () => {
      const r = await api.post('/students', cm, { fullName: 'Second Student', studentId: 'ST-002' });
      expectStatus(r, 201);
      student2 = r.json.data.id;
    });
  });

  describe('student sign-in', () => {
    it('works with Full Name and Student ID, ignoring letter case and extra spaces', async () => {
      const r = await api.post('/auth/student-login', undefined, { fullName: 'abdirahman ahmed   ALI', studentId: 'st-001' });
      expectStatus(r, 200);
      expect(r.json.data.user).toMatchObject({ role: 'STUDENT', studentCode: 'ST-001' });
      studentToken = r.json.data.accessToken;
    });

    it('does not accept a password field: students have none', async () => {
      const r = await api.post('/auth/student-login', undefined, { fullName: 'Abdirahman Ahmed Ali', studentId: 'ST-001', password: 'x' });
      expect(r.status).toBe(400);
    });

    it('refuses a wrong name', async () => {
      const r = await api.post('/auth/student-login', undefined, { fullName: 'Wrong Name', studentId: 'ST-001' });
      expect(r.status).toBe(401);
      studentFailureMessage = r.json.message;
    });

    it('gives an unknown Student ID the identical answer', async () => {
      const r = await api.post('/auth/student-login', undefined, { fullName: 'Abdirahman Ahmed Ali', studentId: 'ST-999' });
      expect(r.status).toBe(401);
      expect(r.json.message).toBe(studentFailureMessage);
    });

    it('lets a teacher sign in and identifies them as a teacher', async () => {
      const r = await api.post('/auth/teacher-login', undefined, { identifier: 'm.hassan', password: 'Teach1234' });
      expectStatus(r, 200);
      expect(r.json.data.user.role).toBe('TEACHER');
      expect(r.json.data.user.teacherProfileId).toBeTruthy();
      teacherToken = r.json.data.accessToken;
    });
  });

  describe('who may do what', () => {
    it.each([
      ['a teacher cannot register students', () => api.post('/students', teacherToken, { fullName: 'Hack', studentId: 'ST-777' })],
      ['a teacher cannot create teachers', () => api.post('/teachers', teacherToken, { fullName: 'Hack', username: 'hack', password: 'Hack12345' })],
      ['a teacher cannot assign themselves to a subject', () => api.post('/teacher-subjects', teacherToken, { teacherId, subjectId: physics })],
      ['a teacher cannot change settings', () => api.patch('/settings', teacherToken, { currentPeriod: 'x' })],
      ['a teacher cannot read the audit log', () => api.get('/audit-logs', teacherToken)],
      ['a student cannot list students', () => api.get('/students', studentToken)],
      ["a student cannot open another student's record", () => api.get(`/students/${student2}`, studentToken)],
      ['a student cannot list teachers', () => api.get('/teachers', studentToken)],
      ['a student cannot create subjects', () => api.post('/subjects', studentToken, { name: 'Hack' })],
    ])('%s (403)', async (_name, request) => {
      expect((await request()).status).toBe(403);
    });
  });

  describe('teacher and subject assignments', () => {
    it('shows a teacher no subjects until the Class Master assigns one', async () => {
      const r = await api.get('/subjects', teacherToken);
      expectStatus(r, 200);
      expect(r.json.data).toHaveLength(0);
    });

    it('assigns the teacher to Physics', async () => {
      const r = await api.post('/teacher-subjects', cm, { teacherId, subjectId: physics });
      expectStatus(r, 201);
      assignmentLinkId = r.json.data.id;
    });

    it('refuses the same assignment twice', async () => {
      expect((await api.post('/teacher-subjects', cm, { teacherId, subjectId: physics })).status).toBe(409);
    });

    it('now shows the teacher exactly their own subject', async () => {
      const r = await api.get('/subjects', teacherToken);
      expect(r.json.data).toHaveLength(1);
      expect(r.json.data[0].name).toBe('Physics');
    });

    it('does not let the teacher open a subject they are not assigned to', async () => {
      expect((await api.get(`/subjects/${arabic}`, teacherToken)).status).toBe(403);
    });

    it('does not let a subject with a teacher be deleted', async () => {
      expect((await api.delete(`/subjects/${physics}`, cm)).status).toBe(409);
    });
  });

  describe('what each role sees of a student', () => {
    it('hides private details from teachers', async () => {
      const r = await api.get('/students', teacherToken);
      expectStatus(r, 200);
      expect(r.json.data).toHaveLength(2);
      const row = r.json.data[0];
      expect(row).not.toHaveProperty('phone');
      expect(row).not.toHaveProperty('notes');
      expect(row).not.toHaveProperty('dateOfBirth');
    });

    it('shows the Class Master the full record', async () => {
      const r = await api.get('/students', cm);
      expect(r.json.data[0]).toHaveProperty('notes');
      expect(r.json.data[0]).toHaveProperty('phone');
    });

    it('searches by name', async () => {
      const r = await api.get('/students?search=abdir', cm);
      expect(r.json.data).toHaveLength(1);
      expect(r.json.meta.total).toBe(1);
    });

    it('matches a % in the search literally instead of as a wildcard', async () => {
      const r = await api.get('/students?search=%25', cm);
      expect(r.json.data).toHaveLength(0);
    });

    it('pages and sorts', async () => {
      const r = await api.get('/students?limit=1&page=2&sortBy=studentId&sortOrder=ASC', cm);
      expect(r.json.data).toHaveLength(1);
      expect(r.json.meta.totalPages).toBe(2);
      expect(r.json.data[0].studentId).toBe('ST-002');
    });

    it('ignores an unknown sort key instead of putting it into a query', async () => {
      expectStatus(await api.get('/students?sortBy=password;drop', cm), 200);
    });

    it("lets a student read their own profile, without the Class Master's private notes", async () => {
      const r = await api.get('/students/me', studentToken);
      expectStatus(r, 200);
      expect(r.json.data).toMatchObject({ studentId: 'ST-001', className: '3C Morning Boys' });
      expect(r.json.data).not.toHaveProperty('notes');
    });

    it('lets a teacher read their own profile with their subjects', async () => {
      const r = await api.get('/teachers/me', teacherToken);
      expectStatus(r, 200);
      expect(r.json.data.subjects).toHaveLength(1);
      expect(r.json.data).not.toHaveProperty('notes');
    });

    it('tells the app whether the signed-in person has a photo, so it asks only for photos that exist', async () => {
      const r = await api.get('/users/me', studentToken);
      expectStatus(r, 200);
      expect(r.json.data.hasPhoto).toBe(false);
    });
  });

  describe('taking access away', () => {
    it('suspends a student', async () => {
      const r = await api.patch(`/students/${studentId}/status`, cm, { status: 'SUSPENDED' });
      expectStatus(r, 200);
      expect(r.json.data.status).toBe('SUSPENDED');
    });

    it("stops the suspended student's existing token at once", async () => {
      expect((await api.get('/students/me', studentToken)).status).toBe(401);
    });

    it('stops the suspended student signing in again, with the same generic message', async () => {
      const r = await api.post('/auth/student-login', undefined, { fullName: 'Abdirahman Ahmed Ali', studentId: 'ST-001' });
      expect(r.status).toBe(401);
      expect(r.json.message).toBe(studentFailureMessage);
    });

    it('lets the student back in once reactivated', async () => {
      expectStatus(await api.patch(`/students/${studentId}/status`, cm, { status: 'ACTIVE' }), 200);
      expectStatus(await api.post('/auth/student-login', undefined, { fullName: 'Abdirahman Ahmed Ali', studentId: 'ST-001' }), 200);
    });

    it('resets a teacher password', async () => {
      expectStatus(await api.patch(`/teachers/${teacherId}`, cm, { password: 'NewTeach123' }), 200);
    });

    it("revokes the teacher's old token after a password reset", async () => {
      expect((await api.get('/teachers/me', teacherToken)).status).toBe(401);
    });

    it('accepts the new password', async () => {
      const r = await api.post('/auth/teacher-login', undefined, { identifier: 'm.hassan', password: 'NewTeach123' });
      expectStatus(r, 200);
      teacherToken = r.json.data.accessToken;
    });
  });

  describe('removing and restoring a student', () => {
    it('removes a student without destroying the record', async () => {
      expectStatus(await api.delete(`/students/${student2}`, cm), 200);
    });

    it('hides a removed student from the normal list', async () => {
      const r = await api.get('/students', cm);
      expect(r.json.data).toHaveLength(1);
    });

    it('lists removed students separately', async () => {
      const r = await api.get('/students?onlyDeleted=true', cm);
      expect(r.json.data).toHaveLength(1);
      expect(r.json.data[0].deletedAt).toBeTruthy();
    });

    it('keeps the Student ID of a removed student reserved', async () => {
      expect((await api.post('/students', cm, { fullName: 'Reuse Id', studentId: 'ST-002' })).status).toBe(409);
    });

    it('restores a removed student', async () => {
      const r = await api.post(`/students/${student2}/restore`, cm);
      expectStatus(r, 200);
      expect(r.json.data.deletedAt).toBeNull();
    });
  });

  describe('uploaded files', () => {
    let photoId: string;

    it('accepts a real PNG as a profile photo from the Class Master', async () => {
      const r = await api.call('POST', '/files/upload', { token: cm, form: uploadForm({ category: 'PROFILE_PHOTO' }, 'photo.png', SMALL_PNG) });
      expectStatus(r, 201);
      expect(r.json.data.mimeType).toBe('image/png');
      photoId = r.json.data.id;
    });

    it('checks the content, not the name: PHP code called evil.png is refused', async () => {
      const r = await api.call('POST', '/files/upload', { token: cm, form: uploadForm({ category: 'PROFILE_PHOTO' }, 'evil.png', Buffer.from('<?php echo 1; ?>')) });
      expect(r.status).toBe(400);
    });

    it('refuses a file type that is not allowed', async () => {
      const r = await api.call('POST', '/files/upload', { token: cm, form: uploadForm({ category: 'PROFILE_PHOTO' }, 'run.exe', SMALL_PNG) });
      expect(r.status).toBe(400);
    });

    it('does not let a teacher upload profile photos', async () => {
      const r = await api.call('POST', '/files/upload', { token: teacherToken, form: uploadForm({ category: 'PROFILE_PHOTO' }, 'photo.png', SMALL_PNG) });
      expect(r.status).toBe(403);
    });

    it('attaches the upload to a student, who then has a photo', async () => {
      const r = await api.patch(`/students/${studentId}`, cm, { profilePhotoFileId: photoId });
      expectStatus(r, 200);
      expect(r.json.data.hasPhoto).toBe(true);
    });

    it('does not let one upload be attached to two records', async () => {
      expect((await api.patch(`/students/${student2}`, cm, { profilePhotoFileId: photoId })).status).toBe(409);
    });

    it('serves the photo back byte for byte', async () => {
      const r = await api.get(`/students/${studentId}/photo`, cm);
      expectStatus(r, 200);
      expect(r.raw.equals(SMALL_PNG)).toBe(true);
      expect(r.headers.get('content-type')).toBe('image/png');
    });

    it('answers 404 for a student without a photo, which is why the app checks hasPhoto first', async () => {
      expect((await api.get(`/students/${student2}/photo`, cm)).status).toBe(404);
    });

    it('reports hasPhoto for the student once they sign in again', async () => {
      const token = await api.login('/auth/student-login', { fullName: 'Abdirahman Ahmed Ali', studentId: 'ST-001' });
      const r = await api.get('/users/me', token);
      expect(r.json.data.hasPhoto).toBe(true);
    });
  });

  describe('the audit trail', () => {
    it('records the important events', async () => {
      const r = await api.get('/audit-logs?limit=100', cm);
      const actions = new Set<string>(r.json.data.map((entry: { action: string }) => entry.action));
      for (const action of ['SETUP_COMPLETED', 'AUTH_LOGIN', 'AUTH_LOGIN_FAILED', 'STUDENT_CREATED', 'TEACHER_CREATED', 'SUBJECT_CREATED', 'TEACHER_SUBJECT_ASSIGNED', 'STUDENT_STATUS_CHANGED', 'FILE_UPLOADED']) {
        expect(actions).toContain(action);
      }
    });

    it('never stores a password', async () => {
      const r = await api.get('/audit-logs?limit=100', cm);
      const text = JSON.stringify(r.json);
      for (const secret of ['Secret123', 'Teach1234', 'NewTeach123']) expect(text).not.toContain(secret);
    });

    it('lets the Class Master remove a teacher assignment', async () => {
      expectStatus(await api.delete(`/teacher-subjects/${assignmentLinkId}`, cm), 200);
    });
  });

  describe('brute-force protection (last: it locks an account and an address)', () => {
    it('locks an account after 5 failed attempts, even for the correct name', async () => {
      for (let i = 0; i < 5; i += 1) {
        await api.post('/auth/student-login', undefined, { fullName: `Guess Number ${i}`, studentId: 'ST-002' });
      }
      const r = await api.post('/auth/student-login', undefined, { fullName: 'Second Student', studentId: 'ST-002' });
      expect(r.status).toBe(401);
    });

    it('limits sign-in attempts per address and then answers 429 in the standard error format', async () => {
      const ip = '203.0.113.50';
      const statuses: number[] = [];
      let last = await api.call('POST', '/auth/class-master-login', { ip, body: { identifier: 'classmaster', password: 'WrongPass1' } });
      statuses.push(last.status);
      for (let i = 1; i < 13; i += 1) {
        last = await api.call('POST', '/auth/class-master-login', { ip, body: { identifier: 'classmaster', password: 'WrongPass1' } });
        statuses.push(last.status);
      }
      expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
      expect(statuses.slice(10).every((s) => s === 429)).toBe(true);
      expect(last.json).toMatchObject({ success: false, statusCode: 429 });
    });
  });
});
