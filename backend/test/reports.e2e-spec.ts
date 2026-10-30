import { Api, expectStatus, futureIso } from './support/api';
import { create, createTestApp, setUpClassMaster, TestApp } from './support/test-app';

interface Created {
  id: string;
}

interface Row {
  [key: string]: string | number | null;
}

describe('Reports (JSON, CSV and PDF built from real data)', () => {
  let t: TestApp;
  let api: Api;
  let cm: string;
  let T1: string;
  let T2: string;
  let S1: string;
  let S2: string;
  let physics: string;
  let arabic: string;
  let s1: Created;
  let s2: Created;
  let s3: Created;
  let ex1: { id: string; subjects: { id: string; subjectName: string }[] };
  let ex2: { id: string; subjects: { id: string }[] };
  let assignmentId: string;

  const esId = (name: string) => ex1.subjects.find((s) => s.subjectName === name)!.id;
  const rowsOf = (response: { json: { data: { sections: { rows: Row[] }[] } } }, section = 0): Row[] => response.json.data.sections[section].rows;
  const summaryValue = (doc: { summary: { label: string; value: unknown }[] }, label: string) => doc.summary.find((x) => x.label === label)?.value;
  const reportFileCount = async () => (await api.get('/files?category=REPORT&limit=100', cm)).json.meta.total as number;

  const submitAndApprove = async (examSubjectId: string, token: string, entries: unknown[]) => {
    await api.put(`/marks/examination-subjects/${examSubjectId}`, token, { entries });
    await api.post(`/marks/examination-subjects/${examSubjectId}/submit`, token, { confirm: true });
    await api.post(`/marks/examination-subjects/${examSubjectId}/review`, cm, { decision: 'APPROVE' });
  };

  beforeAll(async () => {
    t = await createTestApp(5);
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
    await api.post('/grading', cm, {
      name: 'Standard',
      maxMark: 100,
      activate: true,
      bands: [
        { grade: 'A', minMark: 80, maxMark: 100, remark: 'Excellent' },
        { grade: 'B', minMark: 60, maxMark: 79.99, remark: 'Good' },
        { grade: 'C', minMark: 40, maxMark: 59.99, remark: 'Fair' },
        { grade: 'F', minMark: 0, maxMark: 39.99, remark: 'Fail', isPassing: false },
      ],
    });
    ex1 = (await api.post('/examinations', cm, { name: 'Term 1 Midterm', type: 'MIDTERM', examDate: '2026-11-10', academicPeriod: 'Term 1', subjects: [{ subjectId: physics, maxMarks: 100 }, { subjectId: arabic, maxMarks: 50 }] })).json.data;
  });

  afterAll(async () => {
    await t.close();
  });

  describe('when nothing is published', () => {
    it('needs a sign-in', async () => {
      expect((await api.get('/reports/class-performance')).status).toBe(401);
    });

    it('refuses the report of an unpublished examination', async () => {
      expect((await api.get(`/reports/examination-results?examinationId=${ex1.id}`, cm)).status).toBe(409);
    });

    it('shows an empty class performance report, not invented numbers', async () => {
      const r = await api.get('/reports/class-performance', cm);
      expectStatus(r, 200);
      expect(rowsOf(r)).toHaveLength(0);
      expect(summaryValue(r.json.data, 'Examinations')).toBe(0);
    });

    it('shows empty rankings', async () => {
      const r = await api.get('/reports/rankings', cm);
      expectStatus(r, 200);
      expect(rowsOf(r)).toHaveLength(0);
    });
  });

  describe('after two examinations are published', () => {
    it('refuses an approved but unpublished examination', async () => {
      await submitAndApprove(esId('Physics'), T1, [{ studentId: s1.id, score: 90 }, { studentId: s2.id, score: 65 }, { studentId: s3.id, isAbsent: true }]);
      await submitAndApprove(esId('Arabic'), T2, [{ studentId: s1.id, score: 40 }, { studentId: s2.id, score: 30 }, { studentId: s3.id, score: 20 }]);
      expectStatus(await api.post('/results/publish', cm, { examinationId: ex1.id }), 200);

      ex2 = (await api.post('/examinations', cm, { name: 'Term 2 Quiz', type: 'QUIZ', examDate: '2027-01-15', academicPeriod: 'Term 2', subjects: [{ subjectId: physics, maxMarks: 50 }] })).json.data;
      await submitAndApprove(ex2.subjects[0].id, T1, [{ studentId: s1.id, score: 20 }, { studentId: s2.id, score: 45 }, { studentId: s3.id, score: 25 }]);
      expect((await api.get(`/reports/examination-results?examinationId=${ex2.id}`, cm)).status).toBe(409);
      expectStatus(await api.post('/results/publish', cm, { examinationId: ex2.id }), 200);
    });
  });

  describe('who may ask for which report', () => {
    it.each([
      ['a student, the examination report', () => api.get(`/reports/examination-results?examinationId=${ex1.id}`, S1), 403],
      ['a teacher, the examination report', () => api.get(`/reports/examination-results?examinationId=${ex1.id}`, T1), 403],
      ['a teacher, class performance', () => api.get('/reports/class-performance', T1), 403],
      ['a student, rankings', () => api.get('/reports/rankings', S1), 403],
      ['a student, a student report by id', () => api.get(`/reports/student-performance?studentId=${s1.id}`, S1), 403],
      ['a teacher, my-performance', () => api.get('/reports/my-performance', T1), 403],
      ['the Class Master, a malformed id', () => api.get('/reports/examination-results?examinationId=not-a-uuid', cm), 400],
      ['the Class Master, an unknown format', () => api.get(`/reports/examination-results?examinationId=${ex1.id}&format=xml`, cm), 400],
    ])('%s -> %i', async (_name, request, status) => {
      expect((await request()).status).toBe(status);
    });
  });

  describe('examination results', () => {
    it('ranks three students with the correct totals, grades and pass result', async () => {
      const r = await api.get(`/reports/examination-results?examinationId=${ex1.id}`, cm);
      expectStatus(r, 200);
      const ranking = rowsOf(r);
      expect(ranking).toHaveLength(3);
      expect(ranking[0]).toMatchObject({ name: 'Student One', total: 130, max: 150, percentage: 86.67, rank: 1, grade: 'A', result: 'Pass' });
    });

    it('shows ABS for an absent student and counts it as 0 in the total', async () => {
      const ranking = rowsOf(await api.get(`/reports/examination-results?examinationId=${ex1.id}`, cm));
      expect(ranking[2]).toMatchObject({ name: 'Student Three', total: 20, result: 'Fail' });
      expect(Object.values(ranking[2])).toContain('ABS');
    });

    it('builds the subject columns from the real subjects', async () => {
      const r = await api.get(`/reports/examination-results?examinationId=${ex1.id}`, cm);
      const labels = r.json.data.sections[0].columns.map((c: { label: string }) => c.label);
      expect(labels).toEqual(expect.arrayContaining(['Physics', 'Arabic']));
    });

    it('computes the summary statistics from the data', async () => {
      const doc = (await api.get(`/reports/examination-results?examinationId=${ex1.id}`, cm)).json.data;
      expect(summaryValue(doc, 'Students ranked')).toBe(3);
      expect(summaryValue(doc, 'Highest (%)')).toBe(86.67);
      expect(summaryValue(doc, 'Lowest (%)')).toBe(13.33);
      expect(summaryValue(doc, 'Class average (%)')).toBe(54.44);
      expect(summaryValue(doc, 'Pass rate (%)')).toBe(66.67);
      expect(doc.className).toBe('3C Morning Boys');
    });

    it('downloads as CSV: attachment, byte-order mark, CRLF, no internal ids', async () => {
      const before = await reportFileCount();
      const r = await api.get(`/reports/examination-results?examinationId=${ex1.id}&format=csv`, cm);
      expectStatus(r, 200);
      const csv = r.raw.toString('utf8');
      expect(r.headers.get('content-type')).toMatch(/^text\/csv/);
      expect(r.headers.get('content-disposition')).toMatch(/attachment.*\.csv/);
      expect(csv.startsWith('﻿')).toBe(true);
      expect(csv).toContain('Student One');
      expect(csv).toContain('Rank,Student ID,Name');
      expect(csv).toContain('\r\n');
      expect(csv).not.toContain(s1.id);
      expect(await reportFileCount()).toBe(before + 1);
    });

    it('downloads as a valid PDF and stores it as a report file', async () => {
      const before = await reportFileCount();
      const r = await api.get(`/reports/examination-results?examinationId=${ex1.id}&format=pdf`, cm);
      expectStatus(r, 200);
      expect(r.headers.get('content-type')).toMatch(/^application\/pdf/);
      expect(r.headers.get('content-disposition')).toMatch(/\.pdf/);
      expect(r.raw.subarray(0, 5).toString()).toBe('%PDF-');
      expect(r.raw.subarray(-8).toString()).toContain('%%EOF');
      expect(r.raw.length).toBeGreaterThan(1500);
      expect(await reportFileCount()).toBe(before + 1);
    });
  });

  describe('student performance', () => {
    it('averages the examination percentages and shows rank and class size', async () => {
      const r = await api.get(`/reports/student-performance?studentId=${s1.id}`, cm);
      expectStatus(r, 200);
      const doc = r.json.data;
      expect(doc.sections[0].rows).toHaveLength(2);
      expect(summaryValue(doc, 'Examinations')).toBe(2);
      expect(summaryValue(doc, 'Average (%)')).toBe(63.34);
      expect(summaryValue(doc, 'Best (%)')).toBe(86.67);
      expect(summaryValue(doc, 'Lowest (%)')).toBe(40);
      expect(doc.sections[0].rows[0]).toMatchObject({ rank: 1, size: 3 });
    });

    it('adds a per-subject section', async () => {
      const rows = rowsOf(await api.get(`/reports/student-performance?studentId=${s1.id}`, cm), 1);
      expect(rows).toHaveLength(2);
      expect(rows.find((x) => x.subject === 'Physics')).toMatchObject({ exams: 2, average: 65 });
    });

    it('answers 404 for an unknown student', async () => {
      expect((await api.get('/reports/student-performance?studentId=3f2504e0-4f89-41d3-9a0c-0305e82c3301', cm)).status).toBe(404);
    });

    it('gives each student their own report, and does not store their own downloads', async () => {
      const before = await reportFileCount();
      const mine = await api.get('/reports/my-performance', S1);
      expectStatus(mine, 200);
      expect(summaryValue(mine.json.data, 'Student')).toBe('Student One');
      expect(mine.json.data.sections[0].rows).toHaveLength(2);
      expect(summaryValue((await api.get('/reports/my-performance', S2)).json.data, 'Student')).toBe('Student Two');
      const pdf = await api.get('/reports/my-performance?format=pdf', S1);
      expectStatus(pdf, 200);
      expect(pdf.raw.subarray(0, 5).toString()).toBe('%PDF-');
      expect(await reportFileCount()).toBe(before);
    });
  });

  describe('subject performance', () => {
    it('gives a teacher their own subject with student scores and the grade distribution', async () => {
      const r = await api.get(`/reports/subject-performance?subjectId=${physics}&examinationId=${ex1.id}`, T1);
      expectStatus(r, 200);
      const doc = r.json.data;
      expect(doc.sections).toHaveLength(3);
      expect(doc.sections[2].rows).toHaveLength(3);
      expect(doc.sections[2].rows[0]).toMatchObject({ name: 'Student One', rank: 1 });
      expect(doc.sections[0].rows[0]).toMatchObject({ average: 51.67, absent: 1 });
      expect(doc.sections[1].rows).toEqual(expect.arrayContaining([expect.objectContaining({ grade: 'A', count: 1 }), expect.objectContaining({ grade: 'B', count: 1 })]));
    });

    it('lets the Class Master see a subject across all examinations', async () => {
      const r = await api.get(`/reports/subject-performance?subjectId=${physics}`, cm);
      expect(r.json.data.sections).toHaveLength(2);
      expect(r.json.data.sections[0].rows).toHaveLength(2);
    });

    it('keeps a teacher out of another subject, and students out of subject reports', async () => {
      expect((await api.get(`/reports/subject-performance?subjectId=${arabic}`, T1)).status).toBe(403);
      expect((await api.get(`/reports/subject-performance?subjectId=${physics}`, S1)).status).toBe(403);
    });
  });

  describe('class performance and rankings', () => {
    it('has one row per published examination', async () => {
      const r = await api.get('/reports/class-performance', cm);
      expectStatus(r, 200);
      const rows = rowsOf(r);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ exam: 'Term 1 Midterm', students: 3, top: 'Student One' });
    });

    it('filters by academic period', async () => {
      const rows = rowsOf(await api.get('/reports/class-performance?academicPeriod=Term%202', cm));
      expect(rows).toHaveLength(1);
      expect(rows[0].exam).toBe('Term 2 Quiz');
    });

    it('ranks by the average over both examinations', async () => {
      const rows = rowsOf(await api.get('/reports/rankings', cm));
      expect(rows).toHaveLength(3);
      expect(rows[0]).toMatchObject({ name: 'Student Two', rank: 1, average: 76.67, grade: 'B' });
    });

    it('exports rankings as CSV and class performance as PDF', async () => {
      const csv = await api.get('/reports/rankings?format=csv', cm);
      expectStatus(csv, 200);
      expect(csv.raw.toString('utf8')).toContain('Student Two');
      const pdf = await api.get('/reports/class-performance?format=pdf', cm);
      expectStatus(pdf, 200);
      expect(pdf.raw.subarray(0, 5).toString()).toBe('%PDF-');
    });
  });

  describe('assignment performance', () => {
    it('counts submitted, graded and missing work for a teacher, and averages the graded scores', async () => {
      assignmentId = (await api.post('/assignments', T1, { subjectId: physics, title: 'Chapter 3 exercises', dueAt: futureIso(86_400_000), maxMarks: 20 })).json.data.id;
      const submission = await api.post('/submissions', S1, { assignmentId, textAnswer: 'answers' });
      await api.post(`/submissions/${submission.json.data.id}/grade`, T1, { score: 15, release: false });
      const r = await api.get('/reports/assignment-performance', T1);
      expectStatus(r, 200);
      expect(rowsOf(r)).toHaveLength(1);
      expect(rowsOf(r)[0]).toMatchObject({ submitted: 1, graded: 1, missing: 2, average: 75 });
    });

    it('adds the student list when one assignment is chosen', async () => {
      const r = await api.get(`/reports/assignment-performance?assignmentId=${assignmentId}`, cm);
      expectStatus(r, 200);
      expect(r.json.data.sections).toHaveLength(2);
      expect(r.json.data.sections[1].rows).toHaveLength(3);
      expect(r.json.data.sections[1].rows.find((x: Row) => x.code === 'ST-001').score).toBe(15);
    });

    it('keeps another teacher out of it', async () => {
      expect(rowsOf(await api.get('/reports/assignment-performance', T2))).toHaveLength(0);
      expect((await api.get(`/reports/assignment-performance?assignmentId=${assignmentId}`, T2)).status).toBe(404);
      expect((await api.get('/reports/assignment-performance', S1)).status).toBe(403);
    });

    it('exports as PDF for a teacher', async () => {
      const r = await api.get(`/reports/assignment-performance?assignmentId=${assignmentId}&format=pdf`, T1);
      expectStatus(r, 200);
      expect(r.raw.subarray(0, 5).toString()).toBe('%PDF-');
    });
  });

  describe('teacher and subject assignments', () => {
    it('lists the links and the subjects without a teacher', async () => {
      await create(api, cm, '/subjects', { name: 'Chemistry' });
      const r = await api.get('/reports/teacher-subjects', cm);
      expectStatus(r, 200);
      expect(rowsOf(r, 0)).toHaveLength(2);
      expect(rowsOf(r, 1)).toHaveLength(1);
      expect(rowsOf(r, 1)[0].subject).toBe('Chemistry');
    });

    it('is closed to teachers', async () => {
      expect((await api.get('/reports/teacher-subjects', T1)).status).toBe(403);
    });
  });

  describe('removing a student after publication', () => {
    it('removes the student', async () => {
      expect([200, 204]).toContain((await api.delete(`/students/${s3.id}`, cm)).status);
    });

    it('keeps the frozen row in published standings', async () => {
      const r = await api.get(`/results/examination/${ex1.id}/standings`, cm);
      expectStatus(r, 200);
      expect(r.json.data.rows).toHaveLength(3);
      expect(r.json.data.rows[2]).toMatchObject({ studentName: 'Student Three' });
      expect(r.json.data.rows[2].subjects).toHaveLength(2);
    });

    it('keeps published history in the reports', async () => {
      expect(rowsOf(await api.get(`/reports/examination-results?examinationId=${ex1.id}`, cm))).toHaveLength(3);
      expect(rowsOf(await api.get(`/reports/student-performance?studentId=${s3.id}`, cm))).toHaveLength(2);
      expect(rowsOf(await api.get(`/reports/subject-performance?subjectId=${physics}&examinationId=${ex1.id}`, cm), 2)).toHaveLength(3);
    });

    it('uses the current roster for work that is still open', async () => {
      const r = await api.get(`/reports/assignment-performance?assignmentId=${assignmentId}`, cm);
      expectStatus(r, 200);
      expect(r.json.data.sections[1].rows).toHaveLength(2);
      expect(r.json.data.sections[0].rows[0].missing).toBe(1);
    });
  });

  it('records report generation in the audit trail', async () => {
    const r = await api.get('/audit-logs?limit=200', cm);
    const actions = new Set<string>(r.json.data.map((a: { action: string }) => a.action));
    expect(actions).toContain('REPORT_GENERATED');
  });
});
