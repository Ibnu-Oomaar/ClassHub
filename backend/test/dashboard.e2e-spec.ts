import { Api, expectStatus, futureIso } from './support/api';
import { create, createTestApp, setUpClassMaster, TestApp } from './support/test-app';

/* eslint-disable @typescript-eslint/no-explicit-any */
describe('Dashboards (every number comes from real records)', () => {
  let t: TestApp;
  let api: Api;
  let cm: string;
  let T1: string;
  let T2: string;
  let S1: string;
  let physics: string;
  let arabic: string;
  let s1: { id: string };
  let s2: { id: string };
  let exam: { id: string; subjects: { id: string; subjectName: string }[] };
  let esPhysics: string;
  let esArabic: string;
  let submissionId: string;

  const dashboard = async (token: string): Promise<any> => {
    const r = await api.get('/dashboard', token);
    expectStatus(r, 200);
    return r.json.data;
  };

  beforeAll(async () => {
    t = await createTestApp(6);
    api = t.api;
    cm = await setUpClassMaster(api);
    await create(api, cm, '/teachers', { fullName: 'Teacher Physics', username: 'tphys', password: 'Teach1234' });
    await create(api, cm, '/teachers', { fullName: 'Teacher Arabic', username: 'tarab', password: 'Teach1234' });
    s1 = await create(api, cm, '/students', { fullName: 'Student One', studentId: 'ST-001' });
    T1 = await api.login('/auth/teacher-login', { identifier: 'tphys', password: 'Teach1234' });
    T2 = await api.login('/auth/teacher-login', { identifier: 'tarab', password: 'Teach1234' });
    S1 = await api.login('/auth/student-login', { fullName: 'Student One', studentId: 'ST-001' });
  });

  afterAll(async () => {
    await t.close();
  });

  describe('an almost empty system', () => {
    it('needs a sign-in', async () => {
      expect((await api.get('/dashboard')).status).toBe(401);
    });

    it('shows the Class Master real zeros and empty lists, nothing invented', async () => {
      const d = await dashboard(cm);
      expect(d).toMatchObject({ role: 'CLASS_MASTER', className: '3C Morning Boys' });
      expect(d.people.subjects.total).toBe(0);
      expect(d.examinations).toMatchObject({ upcoming: 0, awaitingReview: 0, readyToPublish: 0, published: 0 });
      expect(d.assignments.open).toBe(0);
      for (const list of [d.upcomingExaminations, d.latestResults, d.announcements]) expect(list).toHaveLength(0);
      expect(d.lastBackupAt).toBeNull();
    });

    it('counts exactly the people that were created', async () => {
      const d = await dashboard(cm);
      expect(d.people.students).toMatchObject({ total: 1, active: 1 });
      expect(d.people.teachers).toMatchObject({ total: 2, active: 2 });
    });

    it('builds recent activity from the audit trail', async () => {
      const d = await dashboard(cm);
      expect(d.recentActivity.length).toBeGreaterThan(0);
      expect(d.recentActivity.length).toBeLessThanOrEqual(8);
      expect(d.recentActivity.every((a: any) => a.summary && a.actorName)).toBe(true);
    });

    it('shows a teacher without subjects all zeros', async () => {
      const d = await dashboard(T1);
      expect(d).toMatchObject({ role: 'TEACHER' });
      expect(d.subjects).toHaveLength(0);
      expect(d.marks.toEnter).toBe(0);
      expect(d.assignments.open).toBe(0);
    });

    it('shows a student with nothing yet all zeros and no latest result', async () => {
      const d = await dashboard(S1);
      expect(d).toMatchObject({ role: 'STUDENT' });
      expect(d.results).toMatchObject({ published: 0, averagePercentage: null, latest: null });
      expect(d.assignments.toDo).toBe(0);
      expect(d.recentGrades).toHaveLength(0);
    });

    it('never gives a student another role’s dashboard', async () => {
      const r = await api.get('/dashboard?role=CLASS_MASTER', S1);
      expect(r.status === 400 || (r.status === 200 && r.json.data.role === 'STUDENT')).toBe(true);
    });
  });

  describe('with subjects, exams and marks', () => {
    it('counts subjects, including those without a teacher', async () => {
      physics = (await create(api, cm, '/subjects', { name: 'Physics' })).id;
      arabic = (await create(api, cm, '/subjects', { name: 'Arabic' })).id;
      await create(api, cm, '/subjects', { name: 'Chemistry' });
      const teachers = (await api.get('/teachers', cm)).json.data;
      await create(api, cm, '/teacher-subjects', { teacherId: teachers.find((x: any) => x.username === 'tphys').id, subjectId: physics });
      await create(api, cm, '/teacher-subjects', { teacherId: teachers.find((x: any) => x.username === 'tarab').id, subjectId: arabic });
      s2 = await create(api, cm, '/students', { fullName: 'Student Two', studentId: 'ST-002' });
      await api.post('/grading', cm, {
        name: 'Standard',
        maxMark: 100,
        activate: true,
        bands: [
          { grade: 'A', minMark: 80, maxMark: 100 },
          { grade: 'B', minMark: 60, maxMark: 79.99 },
          { grade: 'C', minMark: 40, maxMark: 59.99 },
          { grade: 'F', minMark: 0, maxMark: 39.99, isPassing: false },
        ],
      });
      const d = await dashboard(cm);
      expect(d.people.subjects).toMatchObject({ total: 3, active: 3, withoutTeacher: 1 });
    });

    it('lists the scheduled examination as upcoming, not the draft', async () => {
      exam = (await api.post('/examinations', cm, { name: 'Term 1 Midterm', type: 'MIDTERM', examDate: '2026-12-15', academicPeriod: 'Term 1', subjects: [{ subjectId: physics, maxMarks: 100 }, { subjectId: arabic, maxMarks: 50 }] })).json.data;
      esPhysics = exam.subjects.find((s) => s.subjectName === 'Physics')!.id;
      esArabic = exam.subjects.find((s) => s.subjectName === 'Arabic')!.id;
      await api.post('/examinations', cm, { name: 'Hidden draft', type: 'QUIZ', examDate: '2026-12-20', status: 'DRAFT', subjects: [{ subjectId: physics, maxMarks: 10 }] });
      const d = await dashboard(cm);
      expect(d.examinations.upcoming).toBe(1);
      expect(d.upcomingExaminations.map((e: any) => e.name)).toEqual(['Term 1 Midterm']);
    });

    it('gives a teacher only their own subject and the one sheet to enter', async () => {
      const d = await dashboard(T1);
      expect(d.subjects.map((s: any) => s.name)).toEqual(['Physics']);
      expect(d.marks.toEnter).toBe(1);
      expect(d.marksToDo).toHaveLength(1);
      expect(d.marksToDo[0]).toMatchObject({ subjectName: 'Physics', examinationSubjectId: esPhysics });
      expect(d.upcomingExaminations).toHaveLength(1);
    });

    it('shows a student the upcoming exam but not the draft', async () => {
      const d = await dashboard(S1);
      expect(d.upcomingExaminations.map((e: any) => e.name)).toEqual(['Term 1 Midterm']);
    });

    it('follows a mark sheet through submission, rejection and approval', async () => {
      await api.put(`/marks/examination-subjects/${esPhysics}`, T1, { entries: [{ studentId: s1.id, score: 90 }, { studentId: s2.id, score: 55 }] });
      await api.post(`/marks/examination-subjects/${esPhysics}/submit`, T1, { confirm: true });
      expect((await dashboard(cm)).examinations.awaitingReview).toBe(1);
      const teacherAfterSubmit = await dashboard(T1);
      expect(teacherAfterSubmit.marks).toMatchObject({ awaitingReview: 1, toEnter: 0 });
      expect(teacherAfterSubmit.marksToDo).toHaveLength(0);

      await api.post(`/marks/examination-subjects/${esPhysics}/review`, cm, { decision: 'REJECT', feedback: 'Please recheck Student Two.' });
      const rejected = await dashboard(T1);
      expect(rejected.marks.rejected).toBe(1);
      expect(rejected.marksToDo[0].marksStatus).toBe('REJECTED');

      await api.post(`/marks/examination-subjects/${esPhysics}/submit`, T1, { confirm: true });
      await api.post(`/marks/examination-subjects/${esPhysics}/review`, cm, { decision: 'APPROVE' });
      await api.put(`/marks/examination-subjects/${esArabic}`, T2, { entries: [{ studentId: s1.id, score: 40 }, { studentId: s2.id, score: 20 }] });
      await api.post(`/marks/examination-subjects/${esArabic}/submit`, T2, { confirm: true });
      await api.post(`/marks/examination-subjects/${esArabic}/review`, cm, { decision: 'APPROVE' });
      expect((await dashboard(cm)).examinations).toMatchObject({ readyToPublish: 1, awaitingReview: 0, published: 0 });
    });

    it('reports real figures once the results are published', async () => {
      await api.post('/results/publish', cm, { examinationId: exam.id });
      const d = await dashboard(cm);
      expect(d.examinations).toMatchObject({ published: 1, readyToPublish: 0 });
      expect(d.latestResults).toHaveLength(1);
      expect(d.latestResults[0]).toMatchObject({ students: 2, average: 68.34, passRate: 100 });
    });

    it('gives each student their own latest result and rank', async () => {
      const first = await dashboard(S1);
      expect(first.results).toMatchObject({ published: 1, averagePercentage: 86.67 });
      expect(first.results.latest).toMatchObject({ examinationName: 'Term 1 Midterm', rank: 1, classSize: 2 });
      const S2token = await api.login('/auth/student-login', { fullName: 'Student Two', studentId: 'ST-002' });
      const second = await dashboard(S2token);
      expect(second.results.latest.rank).toBe(2);
      expect(second.results.averagePercentage).toBe(50);
    });
  });

  describe('assignments', () => {
    it('shows an open assignment to students, the Class Master and the teacher', async () => {
      const r = await api.post('/assignments', T1, { subjectId: physics, title: 'Chapter 3 exercises', dueAt: futureIso(86_400_000), maxMarks: 20 });
      const assignmentId = r.json.data.id;
      const student = await dashboard(S1);
      expect(student.assignments).toMatchObject({ toDo: 1, submissionsEnabled: true });
      expect(student.assignmentsToDo[0]).toMatchObject({ title: 'Chapter 3 exercises', state: 'OPEN' });
      expect((await dashboard(cm)).assignments.open).toBe(1);
      const teacher = await dashboard(T1);
      expect(teacher.assignments).toMatchObject({ open: 1, submissionsToGrade: 0 });

      const submission = await api.post('/submissions', S1, { assignmentId, textAnswer: 'My answers' });
      submissionId = submission.json.data.id;
    });

    it('moves work from "to do" to "to grade" when a student hands in', async () => {
      const student = await dashboard(S1);
      expect(student.assignments.toDo).toBe(0);
      expect(student.assignmentsToDo).toHaveLength(0);
      const teacher = await dashboard(T1);
      expect(teacher.assignments.submissionsToGrade).toBe(1);
      expect(teacher.assignmentsToGrade[0]).toMatchObject({ ungraded: 1, subjectName: 'Physics' });
    });

    it("does not show one subject's work to another subject's teacher", async () => {
      const d = await dashboard(T2);
      expect(d.assignments.submissionsToGrade).toBe(0);
      expect(d.assignmentsToGrade).toHaveLength(0);
    });

    it('hides a grade from the student until it is released, and removes graded work from the teacher’s list', async () => {
      await api.post(`/submissions/${submissionId}/grade`, T1, { score: 15, release: false });
      expect((await dashboard(S1)).recentGrades).toHaveLength(0);
      expect((await dashboard(T1)).assignments.submissionsToGrade).toBe(0);
      await api.post(`/submissions/${submissionId}/grade`, T1, { score: 15, feedback: 'Good', release: true });
      const grades = (await dashboard(S1)).recentGrades;
      expect(grades).toHaveLength(1);
      expect(grades[0]).toMatchObject({ score: 15, maxMarks: 20 });
    });
  });

  describe('announcements, the submissions switch and the backup reminder', () => {
    it('shows each role only its own announcements', async () => {
      await create(api, cm, '/announcements', { title: 'For students', body: 'Bring books.', audience: 'STUDENTS' });
      await create(api, cm, '/announcements', { title: 'For teachers', body: 'Meeting.', audience: 'TEACHERS' });
      expect((await dashboard(S1)).announcements.map((a: any) => a.title)).toEqual(['For students']);
      expect((await dashboard(T1)).announcements.map((a: any) => a.title)).toEqual(['For teachers']);
      expect((await dashboard(cm)).announcements).toHaveLength(2);
    });

    it('reflects the switch for student hand-ins', async () => {
      await api.patch('/settings', cm, { studentSubmissionsEnabled: false });
      expect((await dashboard(S1)).assignments.submissionsEnabled).toBe(false);
      await api.patch('/settings', cm, { studentSubmissionsEnabled: true });
    });

    it('reports when the last backup was made', async () => {
      expectStatus(await api.post('/backups', cm, {}), 201);
      const d = await dashboard(cm);
      expect(Math.abs(Date.now() - Date.parse(d.lastBackupAt))).toBeLessThan(60_000);
    });
  });
});
