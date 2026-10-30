import { Api, expectStatus } from './support/api';
import { create, createTestApp, setUpClassMaster, TestApp } from './support/test-app';

interface Created {
  id: string;
}

describe('Grading scales, examinations, marks and results', () => {
  let t: TestApp;
  let api: Api;

  let cm: string;
  let T1: string; // teaches Physics
  let T2: string; // teaches Arabic
  let S1: string;
  let S2: string;
  let physics: string;
  let arabic: string;
  let s1: Created;
  let s2: Created;
  let s3: Created;
  let standardId: string;
  let altId: string;
  let exam: { id: string; subjects: { id: string; subjectName: string }[] };
  let draftId: string;
  let esPhysics: string;
  let esArabic: string;
  let sheetUrl: string;
  let arabicUrl: string;
  let markS2: string;
  let markS3: string;
  let markS1: string;

  const standardBands = [
    { grade: 'A', minMark: 80, maxMark: 100, remark: 'Excellent' },
    { grade: 'B', minMark: 60, maxMark: 79.99, remark: 'Good' },
    { grade: 'C', minMark: 40, maxMark: 59.99, remark: 'Fair' },
    { grade: 'F', minMark: 0, maxMark: 39.99, remark: 'Fail', isPassing: false },
  ];

  beforeAll(async () => {
    t = await createTestApp(2);
    api = t.api;
    cm = await setUpClassMaster(api);
    physics = (await create(api, cm, '/subjects', { name: 'Physics' })).id;
    arabic = (await create(api, cm, '/subjects', { name: 'Arabic' })).id;
    const t1 = await create(api, cm, '/teachers', { fullName: 'Teacher Physics', username: 'tphys', password: 'Teach1234' });
    const t2 = await create(api, cm, '/teachers', { fullName: 'Teacher Arabic', username: 'tarab', password: 'Teach1234' });
    s1 = await create(api, cm, '/students', { fullName: 'Student One', studentId: 'ST-001' });
    s2 = await create(api, cm, '/students', { fullName: 'Student Two', studentId: 'ST-002' });
    s3 = await create(api, cm, '/students', { fullName: 'Student Three', studentId: 'ST-003' });
    await create(api, cm, '/teacher-subjects', { teacherId: t1.id, subjectId: physics });
    await create(api, cm, '/teacher-subjects', { teacherId: t2.id, subjectId: arabic });
    T1 = await api.login('/auth/teacher-login', { identifier: 'tphys', password: 'Teach1234' });
    T2 = await api.login('/auth/teacher-login', { identifier: 'tarab', password: 'Teach1234' });
    S1 = await api.login('/auth/student-login', { fullName: 'Student One', studentId: 'ST-001' });
    S2 = await api.login('/auth/student-login', { fullName: 'Student Two', studentId: 'ST-002' });
  });

  afterAll(async () => {
    await t.close();
  });

  describe('grading scales', () => {
    it('has no active scale until the Class Master creates one (nothing is seeded)', async () => {
      const r = await api.get('/grading/active', S1);
      expectStatus(r, 200);
      expect(r.json.data).toBeNull();
    });

    it('refuses a scale without a band starting at 0 marks', async () => {
      expect((await api.post('/grading', cm, { name: 'Bad', maxMark: 100, bands: [{ grade: 'A', minMark: 50, maxMark: 100 }] })).status).toBe(400);
    });

    it('refuses grade labels that repeat, whatever their letter case', async () => {
      const r = await api.post('/grading', cm, { name: 'Bad', maxMark: 100, bands: [{ grade: 'A', minMark: 0, maxMark: 49 }, { grade: 'a', minMark: 50, maxMark: 100 }] });
      expect(r.status).toBe(400);
    });

    it('refuses overlapping grade ranges', async () => {
      const r = await api.post('/grading', cm, { name: 'Bad', maxMark: 100, bands: [{ grade: 'A', minMark: 0, maxMark: 60 }, { grade: 'B', minMark: 50, maxMark: 100 }] });
      expect(r.status).toBe(400);
    });

    it('refuses a range beyond the scale maximum or a reversed range', async () => {
      const exceeds = await api.post('/grading', cm, { name: 'Too high', maxMark: 30, bands: [{ grade: 'A', minMark: 0, maxMark: 31 }] });
      const reversed = await api.post('/grading', cm, { name: 'Reversed', maxMark: 30, bands: [{ grade: 'A', minMark: 20, maxMark: 10 }] });
      expect(exceeds.status).toBe(400);
      expect(reversed.status).toBe(400);
    });

    it('accepts a configured mark maximum greater than 100', async () => {
      const r = await api.post('/grading', cm, {
        name: 'Extended marks',
        maxMark: 150,
        bands: [{ grade: 'A', minMark: 0, maxMark: 150 }],
      });
      expectStatus(r, 201);
      expect(r.json.data.maxMark).toBe(150);
      expect(r.json.data.bands[0]).toMatchObject({ minMark: 0, maxMark: 150 });
    });

    it('does not let a teacher create scales', async () => {
      expect((await api.post('/grading', T1, { name: 'Hack', maxMark: 100, bands: [{ grade: 'A', minMark: 0, maxMark: 100 }] })).status).toBe(403);
    });

    it('creates and activates a scale, listing its bands from the top', async () => {
      const r = await api.post('/grading', cm, { name: 'Standard', maxMark: 100, bands: standardBands, activate: true });
      expectStatus(r, 201);
      expect(r.json.data.isActive).toBe(true);
      expect(r.json.data.maxMark).toBe(100);
      expect(r.json.data.bands).toHaveLength(4);
      expect(r.json.data.bands[0].grade).toBe('A');
      standardId = r.json.data.id;
    });

    it('lets students read the active scale', async () => {
      const r = await api.get('/grading/active', S1);
      expect(r.json.data.name).toBe('Standard');
      expect(r.json.data.maxMark).toBe(100);
    });

    it('does not let the active scale be deleted', async () => {
      const alt = await api.post('/grading', cm, { name: 'Alt', maxMark: 100, bands: [{ grade: 'Z', minMark: 0, maxMark: 100, remark: 'Everything' }] });
      altId = alt.json.data.id;
      expect((await api.delete(`/grading/${standardId}`, cm)).status).toBe(409);
    });

    it('does not let a scale maximum be reduced below its current ranges', async () => {
      expect((await api.patch(`/grading/${altId}`, cm, { maxMark: 50 })).status).toBe(400);
    });
  });

  describe('examinations', () => {
    const examBody = () => ({
      name: 'Term 1 Midterm',
      type: 'MIDTERM',
      examDate: '2026-11-10',
      academicPeriod: 'Term 1',
      instructions: 'Bring a pen.',
      subjects: [{ subjectId: physics, maxMarks: 100 }, { subjectId: arabic, maxMarks: 50 }],
    });

    it('refuses the same subject twice in one examination', async () => {
      const r = await api.post('/examinations', cm, { ...examBody(), subjects: [{ subjectId: physics, maxMarks: 100 }, { subjectId: physics, maxMarks: 50 }] });
      expect(r.status).toBe(400);
    });

    it('refuses maximum marks of 0', async () => {
      expect((await api.post('/examinations', cm, { ...examBody(), subjects: [{ subjectId: physics, maxMarks: 0 }] })).status).toBe(400);
    });

    it('does not let a teacher create examinations', async () => {
      expect((await api.post('/examinations', T1, examBody())).status).toBe(403);
    });

    it('creates an examination whose subjects all start as PENDING', async () => {
      const r = await api.post('/examinations', cm, examBody());
      expectStatus(r, 201);
      expect(r.json.data.subjects).toHaveLength(2);
      expect(r.json.data.subjects.every((s: { marksStatus: string }) => s.marksStatus === 'PENDING')).toBe(true);
      exam = r.json.data;
      esPhysics = exam.subjects.find((s) => s.subjectName === 'Physics')!.id;
      esArabic = exam.subjects.find((s) => s.subjectName === 'Arabic')!.id;
      sheetUrl = `/marks/examination-subjects/${esPhysics}`;
      arabicUrl = `/marks/examination-subjects/${esArabic}`;
    });

    it('keeps a draft examination private to the Class Master', async () => {
      const r = await api.post('/examinations', cm, { ...examBody(), name: 'Hidden Draft', status: 'DRAFT' });
      draftId = r.json.data.id;
      expect((await api.get(`/examinations/${draftId}`, S1)).status).toBe(404);
    });

    it('shows a teacher only non-draft exams, and only their own subject inside', async () => {
      const r = await api.get('/examinations', T1);
      expect(r.json.data).toHaveLength(1);
      expect(r.json.data[0].subjects).toHaveLength(1);
      expect(r.json.data[0].subjects[0].subjectName).toBe('Physics');
    });

    it('shows students the schedule without the marks workflow state', async () => {
      const r = await api.get('/examinations', S1);
      expect(r.json.data).toHaveLength(1);
      expect(r.json.data[0].subjects).toHaveLength(2);
      expect(r.json.data[0].subjects[0]).not.toHaveProperty('marksStatus');
    });

    it('shows the Class Master every examination', async () => {
      const r = await api.get('/examinations', cm);
      expect(r.json.meta.total).toBe(2);
    });
  });

  describe('marks entry by the teacher', () => {
    it("does not open another teacher's mark sheet", async () => {
      expect((await api.get(sheetUrl, T2)).status).toBe(403);
    });

    it('does not open mark sheets for students', async () => {
      expect((await api.get(sheetUrl, S1)).status).toBe(403);
    });

    it('opens the sheet: every student listed, none entered, editable', async () => {
      const r = await api.get(sheetUrl, T1);
      expectStatus(r, 200);
      expect(r.json.data).toMatchObject({ total: 3, entered: 0, canEdit: true, gradingConfigured: true });
    });

    it('refuses a score above the maximum with a readable message', async () => {
      const r = await api.put(sheetUrl, T1, { entries: [{ studentId: s1.id, score: 150 }] });
      expect(r.status).toBe(400);
      expect(JSON.stringify(r.json)).toContain('above the maximum of 100');
    });

    it('refuses a negative score', async () => {
      expect((await api.put(sheetUrl, T1, { entries: [{ studentId: s1.id, score: -5 }] })).status).toBe(400);
    });

    it('refuses a score with three decimals', async () => {
      expect((await api.put(sheetUrl, T1, { entries: [{ studentId: s1.id, score: 55.555 }] })).status).toBe(400);
    });

    it('refuses an absent student who also has a score', async () => {
      expect((await api.put(sheetUrl, T1, { entries: [{ studentId: s1.id, score: 50, isAbsent: true }] })).status).toBe(400);
    });

    it('refuses a student who does not exist', async () => {
      expect((await api.put(sheetUrl, T1, { entries: [{ studentId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301', score: 50 }] })).status).toBe(400);
    });

    it('does not let the Class Master enter marks', async () => {
      expect((await api.put(sheetUrl, cm, { entries: [{ studentId: s1.id, score: 50 }] })).status).toBe(403);
    });

    it('does not let a teacher enter marks for a subject they are not assigned to', async () => {
      expect((await api.put(`/marks/examination-subjects/${esArabic}`, T1, { entries: [{ studentId: s1.id, score: 10 }] })).status).toBe(403);
    });

    it('saves marks: the sheet moves from PENDING to DRAFT and shows live grades', async () => {
      const r = await api.put(sheetUrl, T1, { entries: [{ studentId: s1.id, score: 90 }, { studentId: s2.id, score: 55.5 }, { studentId: s3.id, isAbsent: true }] });
      expectStatus(r, 200);
      expect(r.json.data).toMatchObject({ marksStatus: 'DRAFT', entered: 3 });
      const entries = r.json.data.entries as { studentId: string; markId: string; grade: string }[];
      expect(entries.find((e) => e.studentId === s1.id)!.grade).toBe('A');
      markS1 = entries.find((e) => e.studentId === s1.id)!.markId;
      markS2 = entries.find((e) => e.studentId === s2.id)!.markId;
      markS3 = entries.find((e) => e.studentId === s3.id)!.markId;
    });

    it('updates one mark, and the grade follows the scale (65% is a B)', async () => {
      const r = await api.patch(`/marks/${markS2}`, T1, { score: 65 });
      expectStatus(r, 200);
      expect(r.json.data).toMatchObject({ score: 65, grade: 'B' });
    });

    it('refuses a second mark for the same student and subject', async () => {
      const r = await api.post('/marks', T1, { examinationSubjectId: esPhysics, studentId: s2.id, score: 10 });
      expect(r.status).toBe(409);
    });

    it('clears a single mark', async () => {
      expectStatus(await api.delete(`/marks/${markS3}`, T1), 200);
    });

    it('will not submit while a student has no mark yet', async () => {
      const r = await api.post(`${sheetUrl}/submit`, T1, { confirm: true });
      expect(r.status).toBe(400);
      expect(JSON.stringify(r.json)).toContain('no mark yet');
    });

    it('marks the student absent again', async () => {
      const r = await api.post('/marks', T1, { examinationSubjectId: esPhysics, studentId: s3.id, isAbsent: true });
      expectStatus(r, 201);
      expect(r.json.data).toMatchObject({ isAbsent: true, score: null });
    });

    it('will not submit without explicit confirmation', async () => {
      expect((await api.post(`${sheetUrl}/submit`, T1, {})).status).toBe(400);
    });

    it('submits the sheet, which locks it', async () => {
      const r = await api.post(`${sheetUrl}/submit`, T1, { confirm: true });
      expectStatus(r, 200);
      expect(r.json.data).toMatchObject({ marksStatus: 'SUBMITTED', canEdit: false });
    });

    it('will not edit a submitted mark', async () => {
      expect((await api.patch(`/marks/${markS2}`, T1, { score: 99 })).status).toBe(409);
    });

    it('will not submit twice', async () => {
      expect((await api.post(`${sheetUrl}/submit`, T1, { confirm: true })).status).toBe(409);
    });
  });

  describe('review by the Class Master', () => {
    it('lists the submitted sheet in the review queue', async () => {
      const r = await api.get('/marks/queue', cm);
      expectStatus(r, 200);
      expect(r.json.data).toHaveLength(1);
      expect(r.json.data[0]).toMatchObject({ marksStatus: 'SUBMITTED', entered: 3 });
    });

    it('does not let a teacher approve marks', async () => {
      expect((await api.post(`${sheetUrl}/review`, T1, { decision: 'APPROVE' })).status).toBe(403);
    });

    it('requires feedback when sending marks back', async () => {
      expect((await api.post(`${sheetUrl}/review`, cm, { decision: 'REJECT' })).status).toBe(400);
    });

    it('sends the marks back with feedback', async () => {
      const r = await api.post(`${sheetUrl}/review`, cm, { decision: 'REJECT', feedback: 'Student One looks too low, please recheck.' });
      expectStatus(r, 200);
      expect(r.json.data.marksStatus).toBe('REJECTED');
      expect(r.json.data.reviewFeedback).toContain('recheck');
    });

    it('lets the teacher see the feedback and edit again', async () => {
      const r = await api.get(sheetUrl, T1);
      expect(r.json.data.reviewFeedback).toContain('recheck');
      expect(r.json.data.canEdit).toBe(true);
    });

    it('lets the teacher correct a mark and resubmit, which clears the feedback', async () => {
      const fix = await api.patch(`/marks/${markS1}`, T1, { score: 92 });
      expectStatus(fix, 200);
      expect(fix.json.data.score).toBe(92);
      const r = await api.post(`${sheetUrl}/submit`, T1, { confirm: true });
      expectStatus(r, 200);
      expect(r.json.data).toMatchObject({ marksStatus: 'SUBMITTED', reviewFeedback: null });
    });

    it('approves the marks', async () => {
      const r = await api.post(`${sheetUrl}/review`, cm, { decision: 'APPROVE' });
      expectStatus(r, 200);
      expect(r.json.data.marksStatus).toBe('APPROVED');
    });

    it('will not approve twice', async () => {
      expect((await api.post(`${sheetUrl}/review`, cm, { decision: 'APPROVE' })).status).toBe(409);
    });

    it('locks approved marks for the teacher', async () => {
      expect((await api.put(sheetUrl, T1, { entries: [{ studentId: s1.id, score: 10 }] })).status).toBe(409);
    });
  });

  describe('publishing', () => {
    it('is refused while a subject is not approved, naming the subject', async () => {
      const r = await api.post('/results/publish', cm, { examinationId: exam.id });
      expect(r.status).toBe(409);
      expect(JSON.stringify(r.json)).toContain('Arabic');
    });

    it('shows students nothing before publication', async () => {
      const r = await api.get('/results/my', S1);
      expectStatus(r, 200);
      expect(r.json.data).toHaveLength(0);
    });

    it('lets the second teacher submit Arabic, but standings are not ready yet', async () => {
      await api.put(arabicUrl, T2, { entries: [{ studentId: s1.id, score: 40 }, { studentId: s2.id, score: 30 }, { studentId: s3.id, score: 20 }] });
      expectStatus(await api.post(`${arabicUrl}/submit`, T2, { confirm: true }), 200);
      const r = await api.get(`/results/examination/${exam.id}/standings`, cm);
      expect(r.json.data.readyToPublish).toBe(false);
      expect(r.json.data.blockers.length).toBeGreaterThan(0);
      expect(r.json.data.published).toBe(false);
    });

    it('ranks the class by percentage with correct totals once everything is approved', async () => {
      await api.post(`${arabicUrl}/review`, cm, { decision: 'APPROVE' });
      const r = await api.get(`/results/examination/${exam.id}/standings`, cm);
      const rows = r.json.data.rows;
      expect(r.json.data.readyToPublish).toBe(true);
      expect(rows).toHaveLength(3);
      expect(rows[0]).toMatchObject({ studentCode: 'ST-001', totalScore: 132, totalMax: 150, percentage: 88, rank: 1 });
      expect(rows[1]).toMatchObject({ percentage: 63.33, grade: 'B' });
      expect(rows[2]).toMatchObject({ percentage: 13.33, grade: 'F' });
    });

    it('counts an absent student as 0 and shows them as absent', async () => {
      const r = await api.get(`/results/examination/${exam.id}/standings`, cm);
      const absent = r.json.data.rows[2];
      expect(absent.totalScore).toBe(20);
      expect(absent.subjects.find((s: { subjectName: string }) => s.subjectName === 'Physics').isAbsent).toBe(true);
    });

    it('does not let a teacher publish', async () => {
      expect((await api.post('/results/publish', T1, { examinationId: exam.id })).status).toBe(403);
    });

    it('lets the Class Master publish', async () => {
      const r = await api.post('/results/publish', cm, { examinationId: exam.id });
      expectStatus(r, 200);
      expect(r.json.data).toMatchObject({ published: true, students: 3 });
    });

    it('will not publish twice', async () => {
      expect((await api.post('/results/publish', cm, { examinationId: exam.id })).status).toBe(409);
    });
  });

  describe('what students see', () => {
    it('gives each student their own result: rank, percentage and grade', async () => {
      const r = await api.get('/results/my', S1);
      expect(r.json.data).toHaveLength(1);
      expect(r.json.data[0]).toMatchObject({ rank: 1, classSize: 3, percentage: 88, grade: 'A' });
    });

    it('shows the per-subject scores and grades', async () => {
      const r = await api.get(`/results/my/${exam.id}`, S1);
      expectStatus(r, 200);
      expect(r.json.data.subjects).toHaveLength(2);
      const physicsRow = r.json.data.subjects.find((s: { subjectName: string }) => s.subjectName === 'Physics');
      expect(physicsRow).toMatchObject({ score: 92, grade: 'A' });
      const arabicRow = r.json.data.subjects.find((s: { subjectName: string }) => s.subjectName === 'Arabic');
      expect(arabicRow).toMatchObject({ score: 40, maxMarks: 50, grade: 'C' });
    });

    it('never exposes other students or teacher remarks', async () => {
      const r = await api.get(`/results/my/${exam.id}`, S1);
      const text = JSON.stringify(r.json);
      expect(text).not.toContain('Student Two');
      expect(text).not.toContain('remarks');
    });

    it('gives another student only their own result', async () => {
      const r = await api.get('/results/my', S2);
      expect(r.json.data).toHaveLength(1);
      expect(r.json.data[0]).toMatchObject({ rank: 2, percentage: 63.33 });
    });

    it.each([
      ['the class standings', () => api.get(`/results/examination/${exam.id}/standings`, S1)],
      ['the class result list', () => api.get(`/results?examinationId=${exam.id}`, S1)],
      ['the marks queue', () => api.get('/marks/queue', S1)],
    ])('does not let a student read %s (403)', async (_name, request) => {
      expect((await request()).status).toBe(403);
    });

    it('does not let a teacher list class results', async () => {
      expect((await api.get(`/results?examinationId=${exam.id}`, T1)).status).toBe(403);
    });
  });

  describe('locking after publication', () => {
    it('refuses to reject marks that are part of published results', async () => {
      expect((await api.post(`${sheetUrl}/review`, cm, { decision: 'REJECT', feedback: 'late' })).status).toBe(409);
    });

    it('refuses to change the subjects or maximum marks of a published examination', async () => {
      expect((await api.patch(`/examinations/${exam.id}`, cm, { subjects: [{ subjectId: physics, maxMarks: 200 }] })).status).toBe(409);
    });

    it('refuses to delete an examination that has marks', async () => {
      expect((await api.delete(`/examinations/${exam.id}`, cm)).status).toBe(409);
    });
  });

  describe('frozen grades', () => {
    it('keeps exactly one scale active when another is activated', async () => {
      const activated = await api.post(`/grading/${altId}/activate`, cm);
      expectStatus(activated, 200);
      expect(activated.json.data.isActive).toBe(true);
      const list = await api.get('/grading', cm);
      expect(list.json.data.filter((s: { isActive: boolean }) => s.isActive)).toHaveLength(1);
    });

    it('does not change published grades when the scale changes (still A, not Z)', async () => {
      const r = await api.get(`/results/my/${exam.id}`, S1);
      expect(r.json.data.grade).toBe('A');
      expect(r.json.data.subjects.every((s: { grade: string }) => s.grade !== 'Z')).toBe(true);
      await api.post(`/grading/${standardId}/activate`, cm);
    });
  });

  describe('unpublishing and publishing again', () => {
    it('hides the results from students again', async () => {
      const r = await api.post('/results/unpublish', cm, { examinationId: exam.id });
      expectStatus(r, 200);
      expect(r.json.data.published).toBe(false);
      expect((await api.get('/results/my', S1)).json.data).toHaveLength(0);
    });

    it('refuses direct access to an unpublished result', async () => {
      expect((await api.get(`/results/my/${exam.id}`, S1)).status).toBe(404);
    });

    it('publishes again, and the Class Master can search the ranked list', async () => {
      expectStatus(await api.post('/results/publish', cm, { examinationId: exam.id }), 200);
      const r = await api.get(`/results?examinationId=${exam.id}&search=two`, cm);
      expectStatus(r, 200);
      expect(r.json.data).toHaveLength(1);
      expect(r.json.data[0].studentCode).toBe('ST-002');
    });
  });

  describe('the audit trail', () => {
    it('covers marks, results, examinations and grading scales', async () => {
      const r = await api.get('/audit-logs?limit=200', cm);
      const actions = new Set<string>(r.json.data.map((a: { action: string }) => a.action));
      for (const action of ['MARKS_SAVED', 'MARKS_UPDATED', 'MARKS_SUBMITTED', 'MARKS_APPROVED', 'MARKS_REJECTED', 'RESULTS_PUBLISHED', 'RESULTS_UNPUBLISHED', 'EXAMINATION_CREATED', 'GRADING_SCALE_CREATED', 'GRADING_SCALE_ACTIVATED']) {
        expect(actions).toContain(action);
      }
    });

    it('records the old and the new value when a mark changes', async () => {
      const r = await api.get('/audit-logs?limit=200', cm);
      const updated = r.json.data.find((a: { action: string }) => a.action === 'MARKS_UPDATED');
      expect(JSON.stringify(updated.details)).toContain('"from"');
      expect(JSON.stringify(updated.details)).toContain('"to"');
    });
  });

  describe('mark entry against a 20-mark maximum', () => {
    it('saves 15/20 and rejects 21/20', async () => {
      const created = await api.post('/examinations', cm, {
        name: 'Maximum validation check',
        type: 'QUIZ',
        examDate: '2026-11-20',
        subjects: [{ subjectId: physics, maxMarks: 20 }],
      });
      expectStatus(created, 201);

      const sheetId = created.json.data.subjects[0].id as string;
      const sheetUrl = `/marks/examination-subjects/${sheetId}`;
      const initialSheet = await api.get(sheetUrl, T1);
      expectStatus(initialSheet, 200);
      expect(initialSheet.json.data.maxMarks).toBe(20);

      const accepted = await api.put(sheetUrl, T1, { entries: [{ studentId: s1.id, score: 15 }] });
      expectStatus(accepted, 200);
      expect(accepted.json.data.entries.find((entry: { studentId: string }) => entry.studentId === s1.id).score).toBe(15);

      const rejected = await api.put(sheetUrl, T1, { entries: [{ studentId: s2.id, score: 21 }] });
      expect(rejected.status).toBe(400);

      const savedSheet = await api.get(sheetUrl, T1);
      expect(savedSheet.json.data.entries.find((entry: { studentId: string }) => entry.studentId === s1.id).score).toBe(15);
      expect(savedSheet.json.data.entries.find((entry: { studentId: string }) => entry.studentId === s2.id).score).toBeNull();
    });
  });

  describe('mark entry against the configured 30-mark maximum', () => {
    it('saves 30 and rejects 31', async () => {
      const created = await api.post('/examinations', cm, {
        name: '30-mark validation check',
        type: 'QUIZ',
        examDate: '2026-11-21',
        subjects: [{ subjectId: physics, maxMarks: 30 }],
      });
      expectStatus(created, 201);

      const sheetUrl = `/marks/examination-subjects/${created.json.data.subjects[0].id}`;
      const accepted = await api.put(sheetUrl, T1, { entries: [{ studentId: s1.id, score: 30 }] });
      expectStatus(accepted, 200);
      expect(accepted.json.data.entries.find((entry: { studentId: string }) => entry.studentId === s1.id).score).toBe(30);

      const rejected = await api.put(sheetUrl, T1, { entries: [{ studentId: s2.id, score: 31 }] });
      expect(rejected.status).toBe(400);

      const savedSheet = await api.get(sheetUrl, T1);
      expect(savedSheet.json.data.entries.find((entry: { studentId: string }) => entry.studentId === s1.id).score).toBe(30);
      expect(savedSheet.json.data.entries.find((entry: { studentId: string }) => entry.studentId === s2.id).score).toBeNull();
    });
  });
});
