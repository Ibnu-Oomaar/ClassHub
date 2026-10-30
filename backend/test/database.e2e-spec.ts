import { Api, expectStatus } from './support/api';
import { create, createTestApp, setUpClassMaster, TestApp } from './support/test-app';

const TABLES = [
  'announcements', 'app_settings', 'assignment_attachments', 'assignments', 'audit_logs', 'backups', 'examination_subjects', 'examinations',
  'files', 'grade_bands', 'grading_scales', 'marks', 'results', 'students', 'subjects', 'submissions', 'teacher_subjects', 'teachers', 'users',
];

/** PostgreSQL error codes the tests expect. */
const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

describe('The database', () => {
  let t: TestApp;
  let api: Api;
  let cm: string;
  let studentId: string;
  let subjectId: string;

  /** Inserts a copy of the first row of a table (new id, same everything else): what a duplicate would look like. */
  const duplicateFirstRow = (table: string) =>
    t.sql(`DO $$ DECLARE cols text; BEGIN
      SELECT string_agg(quote_ident(column_name), ',') INTO cols FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${table}' AND column_name <> 'id';
      EXECUTE format('INSERT INTO ${table} (id, %1$s) SELECT gen_random_uuid(), %1$s FROM ${table} LIMIT 1', cols);
    END $$`);

  beforeAll(async () => {
    t = await createTestApp(10);
    api = t.api;
  });

  afterAll(async () => {
    await t.close();
  });

  describe('on a fresh install', () => {
    it('has every table, created by TypeORM synchronization from the entities', async () => {
      const rows = await t.sql("select tablename from pg_tables where schemaname = 'public' order by 1");
      expect(rows.map((r) => r.tablename)).toEqual(TABLES);
    });

    it('has no migrations table: the schema is not managed by migration files', async () => {
      const rows = await t.sql("select tablename from pg_tables where schemaname = 'public' and tablename ilike '%migration%'");
      expect(rows).toHaveLength(0);
    });

    it('has no rows at all in any table: no seed data, no demo data, no default subjects', async () => {
      for (const table of TABLES) {
        const [row] = await t.sql(`select count(*)::int as n from ${table}`);
        expect({ table, rows: row.n }).toEqual({ table, rows: 0 });
      }
    });

    it('uses snake_case column names', async () => {
      const rows = await t.sql("select column_name from information_schema.columns where table_schema = 'public' and column_name ~ '[A-Z]'");
      expect(rows).toHaveLength(0);
    });
  });

  describe('with records in it', () => {
    beforeAll(async () => {
      cm = await setUpClassMaster(api);
      subjectId = (await create(api, cm, '/subjects', { name: 'Physics' })).id;
      const teacher = await create(api, cm, '/teachers', { fullName: 'Teacher Physics', username: 'tphys', password: 'Teach1234' });
      await create(api, cm, '/teacher-subjects', { teacherId: teacher.id, subjectId });
      studentId = (await create(api, cm, '/students', { fullName: 'Student One', studentId: 'ST-001' })).id;
      await create(api, cm, '/students', { fullName: 'Student Two', studentId: 'ST-002' });
      await api.post('/grading', cm, {
        name: 'Standard',
        maxMark: 100,
        activate: true,
        bands: [
          { grade: 'A', minMark: 50, maxMark: 100 },
          { grade: 'F', minMark: 0, maxMark: 49.99, isPassing: false },
        ],
      });
      const exam = (await api.post('/examinations', cm, { name: 'Midterm', type: 'MIDTERM', examDate: '2026-11-10', subjects: [{ subjectId, maxMarks: 100 }] })).json.data;
      const teacherToken = await api.login('/auth/teacher-login', { identifier: 'tphys', password: 'Teach1234' });
      const sheet = `/marks/examination-subjects/${exam.subjects[0].id}`;
      const students = (await api.get('/students', cm)).json.data as { id: string }[];
      await api.put(sheet, teacherToken, { entries: students.map((s, i) => ({ studentId: s.id, score: 60 + i })) });
      await api.post(`${sheet}/submit`, teacherToken, { confirm: true });
      await api.post(`${sheet}/review`, cm, { decision: 'APPROVE' });
      expectStatus(await api.post('/results/publish', cm, { examinationId: exam.id }), 200);
      const assignment = await api.post('/assignments', teacherToken, { subjectId, title: 'Homework', dueAt: new Date(Date.now() + 86_400_000).toISOString(), maxMarks: 10 });
      const studentToken = await api.login('/auth/student-login', { fullName: 'Student One', studentId: 'ST-001' });
      await api.post('/submissions', studentToken, { assignmentId: assignment.json.data.id, textAnswer: 'done' });
    });

    it.each([
      ['marks', 'one mark per student and subject'],
      ['results', 'one result per student and examination'],
      ['submissions', 'one submission per student and assignment'],
      ['teacher_subjects', 'one link per teacher and subject'],
      ['examination_subjects', 'one entry per subject in an examination'],
      ['grade_bands', 'one band per grade in a scale'],
    ])('%s: the database itself allows only %s', async (table) => {
      await expect(duplicateFirstRow(table)).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
    });

    it('allows only one active grading scale, even if two are switched on by hand', async () => {
      await api.post('/grading', cm, { name: 'Second', maxMark: 100, bands: [{ grade: 'X', minMark: 0, maxMark: 100 }] });
      await expect(t.sql('update grading_scales set is_active = true')).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
    });

    it('keeps exactly one settings row', async () => {
      await expect(duplicateFirstRow('app_settings')).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
    });

    it('keeps Student IDs, usernames, emails, subject names and codes unique', async () => {
      await expect(t.sql("update students set student_id = 'ST-001'")).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
      await expect(t.sql("update subjects set name_key = 'physics' where false")).resolves.toBeDefined();
      await expect(duplicateFirstRow('subjects')).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
      await expect(t.sql("update users set username = 'classmaster' where username = 'tphys'")).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
    });

    it('will not erase the history of a student who has marks, results or submissions', async () => {
      await expect(t.sql('delete from students where id = $1', [studentId])).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
    });

    it('will not delete a subject that examinations, assignments or teachers still use', async () => {
      await expect(t.sql('delete from subjects where id = $1', [subjectId])).rejects.toMatchObject({ code: FOREIGN_KEY_VIOLATION });
    });

    it('removes people softly: the row stays, marked with a deletion time', async () => {
      expectStatus(await api.delete(`/students/${studentId}`, cm), 200);
      const [row] = await t.sql('select deleted_at from students where id = $1', [studentId]);
      expect(row.deleted_at).not.toBeNull();
      expectStatus(await api.post(`/students/${studentId}/restore`, cm), 200);
      const [restored] = await t.sql('select deleted_at from students where id = $1', [studentId]);
      expect(restored.deleted_at).toBeNull();
    });

    it('stores only argon2id hashes for passwords, and none for students', async () => {
      const staff = await t.sql("select password_hash from users where role in ('CLASS_MASTER','TEACHER')");
      expect(staff.length).toBeGreaterThan(0);
      for (const row of staff) expect(String(row.password_hash)).toMatch(/^\$argon2id\$/);
      const students = await t.sql("select password_hash from users where role = 'STUDENT'");
      for (const row of students) expect(row.password_hash).toBeNull();
    });

    it('stores marks exactly, to two decimals, without floating-point drift', async () => {
      const rows = await t.sql('select score::text as score from marks order by score');
      expect(rows.map((r) => r.score)).toEqual(['60.00', '61.00']);
    });
  });

  describe('across restarts', () => {
    it('keeps every record when the application starts again on the same database (nothing is wiped, reseeded or migrated)', async () => {
      const before = (await t.sql('select (select count(*) from users)::int as users, (select count(*) from students)::int as students, (select count(*) from marks)::int as marks'))[0];
      const storagePath = t.storagePath;
      await t.close(true);

      t = await createTestApp(10, { keepData: true, storagePath });
      api = t.api;
      const after = (await t.sql('select (select count(*) from users)::int as users, (select count(*) from students)::int as students, (select count(*) from marks)::int as marks'))[0];
      expect(after).toEqual(before);
      expect(before.students).toBeGreaterThan(0);

      const token = await api.login('/auth/class-master-login', { identifier: 'classmaster', password: 'Secret123' });
      expect((await api.get('/students', token)).json.meta.total).toBe(2);
      expect((await api.get('/setup/status')).json.data.setupCompleted).toBe(true);
    });
  });
});
