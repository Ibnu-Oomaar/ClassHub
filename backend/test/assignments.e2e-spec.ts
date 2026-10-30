import { Api, expectStatus, futureIso, SMALL_PDF, sleep, uploadForm } from './support/api';
import { create, createTestApp, setUpClassMaster, TestApp } from './support/test-app';

describe('Assignments and submissions', () => {
  let t: TestApp;
  let api: Api;

  let cm: string;
  let T1: string; // teaches Physics
  let T2: string; // teaches Arabic
  let S1: string;
  let S2: string;
  let S3: string;
  let physics: string;
  let arabic: string;

  let attachId: string;
  let A1: string;
  let A2: string;
  let AHidden: string;
  let SUB1: string;
  let SUB2: string;
  let SUB3: string;
  let s1File: string;
  let ALate: string;
  let AStrict: string;

  const upload = (token: string, category: string, name: string) => api.call('POST', '/files/upload', { token, form: uploadForm({ category }, name, SMALL_PDF, 'application/pdf') });
  const baseBody = () => ({ subjectId: physics, title: 'Chapter 3 exercises', description: 'Solve 1-10', dueAt: futureIso(86_400_000), maxMarks: 20 });

  beforeAll(async () => {
    t = await createTestApp(3);
    api = t.api;
    cm = await setUpClassMaster(api);
    physics = (await create(api, cm, '/subjects', { name: 'Physics' })).id;
    arabic = (await create(api, cm, '/subjects', { name: 'Arabic' })).id;
    const t1 = await create(api, cm, '/teachers', { fullName: 'Teacher Physics', username: 'tphys', password: 'Teach1234' });
    const t2 = await create(api, cm, '/teachers', { fullName: 'Teacher Arabic', username: 'tarab', password: 'Teach1234' });
    await create(api, cm, '/students', { fullName: 'Student One', studentId: 'ST-001' });
    await create(api, cm, '/students', { fullName: 'Student Two', studentId: 'ST-002' });
    await create(api, cm, '/students', { fullName: 'Student Three', studentId: 'ST-003' });
    await create(api, cm, '/teacher-subjects', { teacherId: t1.id, subjectId: physics });
    await create(api, cm, '/teacher-subjects', { teacherId: t2.id, subjectId: arabic });
    T1 = await api.login('/auth/teacher-login', { identifier: 'tphys', password: 'Teach1234' });
    T2 = await api.login('/auth/teacher-login', { identifier: 'tarab', password: 'Teach1234' });
    S1 = await api.login('/auth/student-login', { fullName: 'Student One', studentId: 'ST-001' });
    S2 = await api.login('/auth/student-login', { fullName: 'Student Two', studentId: 'ST-002' });
    S3 = await api.login('/auth/student-login', { fullName: 'Student Three', studentId: 'ST-003' });
  });

  afterAll(async () => {
    await t.close();
  });

  describe('creating assignments', () => {
    it('is for teachers of the subject only', async () => {
      expect((await api.post('/assignments', S1, baseBody())).status).toBe(403);
      expect((await api.post('/assignments', cm, baseBody())).status).toBe(403);
      expect((await api.post('/assignments', T2, baseBody())).status).toBe(403);
    });

    it('refuses a deadline in the past', async () => {
      expect((await api.post('/assignments', T1, { ...baseBody(), dueAt: futureIso(-60_000) })).status).toBe(400);
    });

    it('refuses maximum marks of 0', async () => {
      expect((await api.post('/assignments', T1, { ...baseBody(), maxMarks: 0 })).status).toBe(400);
    });

    it('refuses fields it does not know', async () => {
      expect((await api.post('/assignments', T1, { ...baseBody(), rogue: 1 })).status).toBe(400);
    });

    it('lets a teacher upload an attachment, but not a student under that category', async () => {
      const ok = await upload(T1, 'ASSIGNMENT_ATTACHMENT', 'worksheet.pdf');
      expectStatus(ok, 201);
      attachId = ok.json.data.id;
      expect((await upload(S1, 'ASSIGNMENT_ATTACHMENT', 'worksheet.pdf')).status).toBe(403);
    });

    it('creates an assignment with its attachment, open for hand-in', async () => {
      const r = await api.post('/assignments', T1, { ...baseBody(), attachmentFileIds: [attachId] });
      expectStatus(r, 201);
      expect(r.json.data.attachments).toHaveLength(1);
      expect(r.json.data.state).toBe('OPEN');
      A1 = r.json.data.id;
    });

    it('lets the other teacher create one for their own subject, visible or hidden', async () => {
      const visible = await api.post('/assignments', T2, { subjectId: arabic, title: 'Arabic essay', dueAt: futureIso(86_400_000), maxMarks: 10 });
      expectStatus(visible, 201);
      A2 = visible.json.data.id;
      const hidden = await api.post('/assignments', T2, { subjectId: arabic, title: 'Hidden draft', dueAt: futureIso(86_400_000), maxMarks: 10, isAvailable: false });
      AHidden = hidden.json.data.id;
    });
  });

  describe('who can see what', () => {
    it('shows students available assignments only', async () => {
      const r = await api.get('/assignments', S1);
      expect(r.json.data).toHaveLength(2);
      expect(r.json.data.some((a: { id: string }) => a.id === AHidden)).toBe(false);
    });

    it('hides a hidden assignment from students completely', async () => {
      expect((await api.get(`/assignments/${AHidden}`, S1)).status).toBe(404);
    });

    it('shows a teacher only their own subject', async () => {
      const r = await api.get('/assignments', T1);
      expect(r.json.data).toHaveLength(1);
      expect(r.json.data[0].id).toBe(A1);
      expect([403, 404]).toContain((await api.get(`/assignments/${A2}`, T1)).status);
    });

    it('shows the Class Master everything', async () => {
      const r = await api.get('/assignments', cm);
      expect(r.json.data).toHaveLength(3);
    });

    it('lets students download the attachment, and other subjects’ teachers not', async () => {
      const ok = await api.get(`/assignments/${A1}/attachments/${attachId}`, S1);
      expectStatus(ok, 200);
      expect(ok.raw.subarray(0, 4).toString()).toBe('%PDF');
      expect([403, 404]).toContain((await api.get(`/assignments/${A1}/attachments/${attachId}`, T2)).status);
    });
  });

  describe('changing assignments', () => {
    it('is not allowed for another teacher', async () => {
      expect([403, 404]).toContain((await api.patch(`/assignments/${A1}`, T2, { title: 'x y z' })).status);
    });

    it('lets the owner edit the title', async () => {
      const r = await api.patch(`/assignments/${A1}`, T1, { title: 'Chapter 3 exercises (v2)' });
      expectStatus(r, 200);
      expect(r.json.data.title).toBe('Chapter 3 exercises (v2)');
    });

    it('lets the Class Master make an assignment available, but not an unrelated teacher', async () => {
      const made = await api.patch(`/assignments/${AHidden}/availability`, cm, { isAvailable: true });
      expectStatus(made, 200);
      expect(made.json.data.isAvailable).toBe(true);
      expect([403, 404]).toContain((await api.patch(`/assignments/${AHidden}/availability`, T1, { isAvailable: false })).status);
    });

    it('lets the owner hide it again', async () => {
      const r = await api.patch(`/assignments/${AHidden}/availability`, T2, { isAvailable: false });
      expectStatus(r, 200);
      expect(r.json.data.isAvailable).toBe(false);
    });
  });

  describe('handing in', () => {
    it('is for students only', async () => {
      expect((await api.post('/submissions', T1, { assignmentId: A1, textAnswer: 'hi' })).status).toBe(403);
    });

    it('refuses an empty hand-in', async () => {
      expect((await api.post('/submissions', S1, { assignmentId: A1 })).status).toBe(400);
    });

    it('refuses a hand-in to a hidden assignment', async () => {
      expect((await api.post('/submissions', S1, { assignmentId: AHidden, textAnswer: 'x' })).status).toBe(404);
    });

    it('lets a student upload their file', async () => {
      const r = await upload(S1, 'SUBMISSION', 'answers.pdf');
      expectStatus(r, 201);
      s1File = r.json.data.id;
    });

    it("refuses another student's upload", async () => {
      expect([400, 403, 404]).toContain((await api.post('/submissions', S2, { assignmentId: A1, fileId: s1File })).status);
    });

    it('accepts text and a file together, on time and not yet graded', async () => {
      const r = await api.post('/submissions', S1, { assignmentId: A1, textAnswer: 'My answers', fileId: s1File });
      expectStatus(r, 201);
      expect(r.json.data).toMatchObject({ status: 'SUBMITTED', score: null, isLate: false, fileName: 'answers.pdf' });
      SUB1 = r.json.data.id;
    });

    it('allows one hand-in per student and assignment', async () => {
      expect((await api.post('/submissions', S1, { assignmentId: A1, textAnswer: 'again' })).status).toBe(409);
    });

    it('accepts a text-only hand-in from another student', async () => {
      const r = await api.post('/submissions', S2, { assignmentId: A1, textAnswer: 'Student two answer' });
      expectStatus(r, 201);
      SUB2 = r.json.data.id;
    });
  });

  describe('who can open a submission or its file', () => {
    it("keeps a student's work from other students", async () => {
      expect((await api.get(`/submissions/${SUB1}`, S2)).status).toBe(403);
      expect((await api.get(`/submissions/${SUB1}/file`, S2)).status).toBe(403);
    });

    it('lets the owner, the subject teacher and the Class Master download the file', async () => {
      for (const token of [S1, T1, cm]) {
        const r = await api.get(`/submissions/${SUB1}/file`, token);
        expectStatus(r, 200);
        expect(r.raw.subarray(0, 4).toString()).toBe('%PDF');
      }
    });

    it('keeps the file from the teacher of another subject', async () => {
      expect((await api.get(`/submissions/${SUB1}/file`, T2)).status).toBe(403);
    });

    it('answers 404 for a hand-in that has no file', async () => {
      expect((await api.get(`/submissions/${SUB2}/file`, cm)).status).toBe(404);
    });

    it('lists a student’s own submissions only, and keeps the staff list from students', async () => {
      const mine = await api.get('/submissions/my', S1);
      expect(mine.json.data).toHaveLength(1);
      expect(mine.json.data[0].id).toBe(SUB1);
      expect((await api.get('/submissions', S1)).status).toBe(403);
    });

    it('gives teachers only the submissions of their own subjects', async () => {
      expect((await api.get('/submissions', T1)).json.data).toHaveLength(2);
      expect((await api.get('/submissions', T2)).json.data).toHaveLength(0);
      expect((await api.get('/submissions', cm)).json.data).toHaveLength(2);
    });
  });

  describe('editing before grading', () => {
    it("does not let a student edit another's work", async () => {
      expect((await api.patch(`/submissions/${SUB2}`, S1, { textAnswer: 'tamper' })).status).toBe(404);
    });

    it('lets a student edit their own', async () => {
      const r = await api.patch(`/submissions/${SUB2}`, S2, { textAnswer: 'Student two, improved' });
      expectStatus(r, 200);
      expect(r.json.data.textAnswer).toBe('Student two, improved');
    });

    it('will not remove the only content', async () => {
      expect((await api.patch(`/submissions/${SUB2}`, S2, { textAnswer: null })).status).toBe(400);
    });

    it('replaces the file and discards the old one', async () => {
      const second = await upload(S1, 'SUBMISSION', 'v2.pdf');
      const r = await api.patch(`/submissions/${SUB1}`, S1, { fileId: second.json.data.id });
      expectStatus(r, 200);
      expect(r.json.data.fileName).toBe('v2.pdf');
      const old = await api.get(`/files/${s1File}`, cm);
      expect(old.status === 404 || old.json?.data?.status === 'DISCARDED' || Boolean(old.json?.data?.deletedAt)).toBe(true);
    });
  });

  describe('the overview for staff', () => {
    it('counts students, hand-ins and missing work', async () => {
      const r = await api.get(`/submissions/assignment/${A1}/overview`, T1);
      expectStatus(r, 200);
      expect(r.json.data.counts).toMatchObject({ students: 3, submitted: 2, missing: 1 });
      expect(r.json.data.rows).toHaveLength(3);
    });

    it('is closed to other teachers and students, open to the Class Master', async () => {
      expect((await api.get(`/submissions/assignment/${A1}/overview`, T2)).status).toBe(403);
      expect((await api.get(`/submissions/assignment/${A1}/overview`, S1)).status).toBe(403);
      expectStatus(await api.get(`/submissions/assignment/${A1}/overview`, cm), 200);
    });
  });

  describe('grading and privacy', () => {
    const grade = (token: string, body: unknown) => api.post(`/submissions/${SUB1}/grade`, token, body);

    it('is for the subject teacher only', async () => {
      expect((await grade(cm, { score: 10 })).status).toBe(403);
      expect((await grade(T2, { score: 10 })).status).toBe(403);
      expect((await grade(S1, { score: 20 })).status).toBe(403);
    });

    it('refuses a score above the maximum or below 0', async () => {
      expect((await grade(T1, { score: 20.01 })).status).toBe(400);
      expect((await grade(T1, { score: -1 })).status).toBe(400);
    });

    it('grades without releasing the grade', async () => {
      const r = await grade(T1, { score: 17.5, feedback: 'Good work', release: false });
      expectStatus(r, 200);
      expect(r.json.data).toMatchObject({ score: 17.5, isReleased: false, status: 'GRADED' });
    });

    it('keeps an unreleased grade hidden from the student everywhere', async () => {
      const detail = await api.get(`/submissions/${SUB1}`, S1);
      expect(detail.json.data).toMatchObject({ score: null, feedback: null, status: 'SUBMITTED', gradedAt: null });
      const list = await api.get('/submissions/my', S1);
      expect(list.json.data[0]).toMatchObject({ score: null, feedback: null });
      const assignment = await api.get(`/assignments/${A1}`, S1);
      expect(assignment.json.data.mySubmission).toMatchObject({ score: null, feedback: null });
    });

    it('locks graded work against edits by the student', async () => {
      expect((await api.patch(`/submissions/${SUB1}`, S1, { textAnswer: 'sneaky edit' })).status).toBe(409);
    });

    it('filters by status', async () => {
      const graded = await api.get('/submissions?status=GRADED', T1);
      expect(graded.json.data).toHaveLength(1);
      expect(graded.json.data[0].score).toBe(17.5);
      expect((await api.get('/submissions?status=SUBMITTED', T1)).json.data).toHaveLength(1);
    });

    it('re-grades and releases by default', async () => {
      const r = await grade(T1, { score: 18, feedback: 'Great, rechecked' });
      expectStatus(r, 200);
      expect(r.json.data).toMatchObject({ isReleased: true, score: 18 });
    });

    it('shows the student the score and feedback once released, and nobody else', async () => {
      const mine = await api.get(`/submissions/${SUB1}`, S1);
      expect(mine.json.data).toMatchObject({ score: 18, feedback: 'Great, rechecked', status: 'GRADED' });
      expect((await api.get(`/assignments/${A1}`, S1)).json.data.mySubmission.score).toBe(18);
      expect((await api.get(`/submissions/${SUB1}`, S2)).status).toBe(403);
    });

    it('will not lower the maximum below a score already given, nor delete an assignment that has work', async () => {
      expect([400, 409]).toContain((await api.patch(`/assignments/${A1}`, T1, { maxMarks: 15 })).status);
      expect((await api.delete(`/assignments/${A1}`, T1)).status).toBe(409);
    });
  });

  describe('deadlines', () => {
    it('accepts an on-time hand-in', async () => {
      const late = await api.post('/assignments', T1, { subjectId: physics, title: 'Quick quiz', dueAt: futureIso(3000), maxMarks: 5, allowLateSubmissions: true });
      ALate = late.json.data.id;
      const strict = await api.post('/assignments', T1, { subjectId: physics, title: 'Strict quiz', dueAt: futureIso(3000), maxMarks: 5, allowLateSubmissions: false });
      AStrict = strict.json.data.id;
      const r = await api.post('/submissions', S3, { assignmentId: ALate, textAnswer: 'on time' });
      expectStatus(r, 201);
      expect(r.json.data.isLate).toBe(false);
      SUB3 = r.json.data.id;
    });

    it('becomes OVERDUE (still accepting) or CLOSED (not accepting) after the deadline', async () => {
      await sleep(3500);
      const overdue = await api.get(`/assignments/${ALate}`, S1);
      expect(overdue.json.data).toMatchObject({ state: 'OVERDUE', acceptsSubmissions: true });
      const closed = await api.get(`/assignments/${AStrict}`, S1);
      expect(closed.json.data).toMatchObject({ state: 'CLOSED', acceptsSubmissions: false });
    });

    it('refuses a hand-in to a closed assignment', async () => {
      expect((await api.post('/submissions', S1, { assignmentId: AStrict, textAnswer: 'too late' })).status).toBe(409);
    });

    it('accepts a late hand-in and flags it', async () => {
      const r = await api.post('/submissions', S1, { assignmentId: ALate, textAnswer: 'late work' });
      expectStatus(r, 201);
      expect(r.json.data.isLate).toBe(true);
    });

    it('flags a hand-in edited after the deadline as late', async () => {
      const r = await api.patch(`/submissions/${SUB3}`, S3, { textAnswer: 'edited after deadline' });
      expectStatus(r, 200);
      expect(r.json.data.isLate).toBe(true);
    });

    it('counts the late work in filters and the overview', async () => {
      const late = await api.get(`/submissions?isLate=true&assignmentId=${ALate}`, T1);
      expect(late.json.data).toHaveLength(2);
      const overview = await api.get(`/submissions/assignment/${ALate}/overview`, T1);
      expect(overview.json.data.counts).toMatchObject({ late: 2, missing: 1 });
    });
  });

  describe('the Class Master’s switch for student hand-ins', () => {
    it('blocks hand-ins while switched off and shows that on the assignment', async () => {
      expectStatus(await api.patch('/settings', cm, { studentSubmissionsEnabled: false }), 200);
      expect((await api.post('/submissions', S2, { assignmentId: A2, textAnswer: 'blocked' })).status).toBe(403);
      expect((await api.get(`/assignments/${A2}`, S2)).json.data.acceptsSubmissions).toBe(false);
    });

    it('allows them again once switched on', async () => {
      await api.patch('/settings', cm, { studentSubmissionsEnabled: true });
      expectStatus(await api.post('/submissions', S2, { assignmentId: A2, textAnswer: 'allowed now' }), 201);
    });
  });

  describe('deleting', () => {
    it('lets the owner delete an assignment that has no work', async () => {
      expect([200, 204]).toContain((await api.delete(`/assignments/${AHidden}`, T2)).status);
      expect((await api.get(`/assignments/${AHidden}`, cm)).status).toBe(404);
    });
  });

  it('records assignment and submission events in the audit trail', async () => {
    const r = await api.get('/audit-logs?limit=100', cm);
    const actions = new Set<string>(r.json.data.map((a: { action: string }) => a.action));
    for (const action of ['ASSIGNMENT_CREATED', 'SUBMISSION_CREATED', 'SUBMISSION_GRADED', 'SUBMISSION_UPDATED']) expect(actions).toContain(action);
  });
});
