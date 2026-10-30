import { API_PREFIX } from '../src/app.setup';
import { Api } from './support/api';
import { discoverRoutes } from './support/routes';
import { create, createTestApp, setUpClassMaster, TestApp } from './support/test-app';

type RoleName = 'CLASS_MASTER' | 'TEACHER' | 'STUDENT';
/** 'public' needs no sign-in; 'any' needs a sign-in but no particular role; otherwise only the listed roles. */
type Access = 'public' | 'any' | RoleName[];

const CM: RoleName = 'CLASS_MASTER';
const TE: RoleName = 'TEACHER';
const ST: RoleName = 'STUDENT';

/**
 * The permission policy, written out in full. Every route of the API must appear here, and the
 * test below checks the table against the code (the @Roles / @Public decorators) and against real
 * requests from each kind of account, so a new route cannot go live without a decision about who may use it.
 * Rules that depend on the record (a teacher only for their own subject, a student only for their own work)
 * are checked in the feature tests; this table is the first, coarse gate.
 */
const POLICY: [route: string, access: Access][] = [
  // setup and sign-in
  ['GET /setup/status', 'public'],
  ['POST /setup/initial', 'public'],
  ['POST /auth/class-master-login', 'public'],
  ['POST /auth/teacher-login', 'public'],
  ['POST /auth/student-login', 'public'],
  ['POST /auth/change-password', [CM, TE]],
  ['GET /users/me', 'any'],
  ['PATCH /users/me', [CM, TE]],
  ['GET /users', [CM]],
  ['GET /users/:id', [CM]],

  // people
  ['GET /students', [CM, TE]],
  ['POST /students', [CM]],
  ['GET /students/me', [ST]],
  ['GET /students/me/photo', [ST]],
  ['GET /students/:id', [CM, TE]],
  ['GET /students/:id/photo', [CM, TE]],
  ['PATCH /students/:id', [CM]],
  ['PATCH /students/:id/status', [CM]],
  ['DELETE /students/:id', [CM]],
  ['POST /students/:id/restore', [CM]],
  ['GET /teachers', [CM]],
  ['POST /teachers', [CM]],
  ['GET /teachers/me', [TE]],
  ['GET /teachers/me/photo', [TE]],
  ['GET /teachers/:id', [CM]],
  ['GET /teachers/:id/photo', [CM]],
  ['PATCH /teachers/:id', [CM]],
  ['PATCH /teachers/:id/status', [CM]],
  ['DELETE /teachers/:id', [CM]],
  ['POST /teachers/:id/restore', [CM]],

  // subjects
  ['GET /subjects', 'any'],
  ['GET /subjects/:id', 'any'],
  ['POST /subjects', [CM]],
  ['PATCH /subjects/:id', [CM]],
  ['DELETE /subjects/:id', [CM]],
  ['GET /teacher-subjects', [CM]],
  ['POST /teacher-subjects', [CM]],
  ['GET /teacher-subjects/:id', [CM]],
  ['PATCH /teacher-subjects/:id', [CM]],
  ['DELETE /teacher-subjects/:id', [CM]],

  // grading, examinations, marks, results
  ['GET /grading', [CM]],
  ['GET /grading/active', 'any'],
  ['GET /grading/:id', [CM]],
  ['POST /grading', [CM]],
  ['PATCH /grading/:id', [CM]],
  ['POST /grading/:id/activate', [CM]],
  ['DELETE /grading/:id', [CM]],
  ['GET /examinations', 'any'],
  ['GET /examinations/:id', 'any'],
  ['POST /examinations', [CM]],
  ['PATCH /examinations/:id', [CM]],
  ['DELETE /examinations/:id', [CM]],
  ['GET /marks/queue', [CM, TE]],
  ['GET /marks/examination-subjects/:id', [CM, TE]],
  ['PUT /marks/examination-subjects/:id', [TE]],
  ['POST /marks/examination-subjects/:id/submit', [TE]],
  ['POST /marks/examination-subjects/:id/review', [CM]],
  ['POST /marks', [TE]],
  ['PATCH /marks/:id', [TE]],
  ['DELETE /marks/:id', [TE]],
  ['GET /results', [CM]],
  ['GET /results/my', [ST]],
  ['GET /results/my/:examinationId', [ST]],
  ['GET /results/examination/:examinationId/standings', [CM]],
  ['POST /results/publish', [CM]],
  ['POST /results/unpublish', [CM]],

  // coursework
  ['GET /assignments', 'any'],
  ['GET /assignments/:id', 'any'],
  ['GET /assignments/:id/attachments/:fileId', 'any'],
  ['POST /assignments', [TE]],
  ['PATCH /assignments/:id', [TE]],
  ['PATCH /assignments/:id/availability', [CM, TE]],
  ['DELETE /assignments/:id', [TE]],
  ['GET /submissions', [CM, TE]],
  ['GET /submissions/my', [ST]],
  ['GET /submissions/assignment/:assignmentId/overview', [CM, TE]],
  ['GET /submissions/:id', 'any'],
  ['GET /submissions/:id/file', 'any'],
  ['POST /submissions', [ST]],
  ['PATCH /submissions/:id', [ST]],
  ['POST /submissions/:id/grade', [TE]],

  // announcements, settings, dashboard
  ['GET /announcements', 'any'],
  ['GET /announcements/:id', 'any'],
  ['POST /announcements', [CM]],
  ['PATCH /announcements/:id', [CM]],
  ['DELETE /announcements/:id', [CM]],
  ['GET /settings', 'any'],
  ['PATCH /settings', [CM]],
  ['GET /dashboard', 'any'],

  // reports
  ['GET /reports/examination-results', [CM]],
  ['GET /reports/class-performance', [CM]],
  ['GET /reports/rankings', [CM]],
  ['GET /reports/student-performance', [CM]],
  ['GET /reports/teacher-subjects', [CM]],
  ['GET /reports/subject-performance', [CM, TE]],
  ['GET /reports/assignment-performance', [CM, TE]],
  ['GET /reports/my-performance', [ST]],

  // files, audit, backups
  ['POST /files/upload', [CM, TE, ST]],
  ['GET /files', [CM]],
  ['GET /files/:id', [CM]],
  ['GET /files/:id/download', [CM]],
  ['DELETE /files/:id', [CM]],
  ['GET /audit-logs', [CM]],
  ['GET /backups', [CM]],
  ['GET /backups/status', [CM]],
  ['GET /backups/:id/download', [CM]],
  ['POST /backups', [CM]],
  ['POST /backups/upload', [CM]],
  ['POST /backups/:id/restore', [CM]],
  ['DELETE /backups/:id', [CM]],
];

const accessOf = (route: { isPublic: boolean; roles: string[] | null }): Access => (route.isPublic ? 'public' : route.roles === null ? 'any' : (route.roles as RoleName[]));
const sorted = (access: Access): Access => (Array.isArray(access) ? ([...access].sort() as RoleName[]) : access);
const NO_ID = '00000000-0000-4000-8000-000000000000';
/** Calling this for real would do real work (a full database dump) rather than just reach the permission check. */
const NOT_PROBED_AS_ALLOWED = new Set(['POST /backups']);

describe('Permissions: who may call which route', () => {
  let t: TestApp;
  let api: Api;
  let tokens: Record<RoleName, string>;

  beforeAll(async () => {
    t = await createTestApp(8);
    api = t.api;
    const cm = await setUpClassMaster(api);
    await create(api, cm, '/teachers', { fullName: 'Teacher One', username: 'teacher1', password: 'Teach1234' });
    await create(api, cm, '/students', { fullName: 'Student One', studentId: 'ST-001' });
    tokens = {
      CLASS_MASTER: cm,
      TEACHER: await api.login('/auth/teacher-login', { identifier: 'teacher1', password: 'Teach1234' }),
      STUDENT: await api.login('/auth/student-login', { fullName: 'Student One', studentId: 'ST-001' }),
    };
  });

  afterAll(async () => {
    await t.close();
  });

  describe('the policy table and the code agree', () => {
    const routes = () => discoverRoutes(t.app);

    it('covers every route the API exposes, and nothing that does not exist', () => {
      const actual = routes().map((r) => r.key.replace(` /${API_PREFIX}`, ' '));
      const written = POLICY.map(([route]) => route);
      expect([...actual].sort()).toEqual([...written].sort());
    });

    it('matches the access rules declared on each route', () => {
      const declared = Object.fromEntries(routes().map((r) => [r.key.replace(` /${API_PREFIX}`, ' '), sorted(accessOf(r))]));
      for (const [route, access] of POLICY) {
        expect({ route, access: declared[route] }).toEqual({ route, access: sorted(access) });
      }
    });

    it('has no route that is open without a sign-in except setup and the three sign-in pages', () => {
      const open = POLICY.filter(([, access]) => access === 'public').map(([route]) => route).sort();
      expect(open).toEqual(['GET /setup/status', 'POST /auth/class-master-login', 'POST /auth/student-login', 'POST /auth/teacher-login', 'POST /setup/initial']);
    });
  });

  describe('real requests', () => {
    const protectedRoutes = POLICY.filter(([, access]) => access !== 'public');
    const request = (route: string, token?: string) => {
      const [method, path] = route.split(' ');
      const url = path.replace(/:[A-Za-z]+/g, NO_ID);
      return api.call(method, url, { token, body: method === 'GET' || method === 'DELETE' ? undefined : {} });
    };

    it.each(protectedRoutes.map(([route]) => [route]))('%s refuses a request with no sign-in (401)', async (route) => {
      expect((await request(route)).status).toBe(401);
    });

    it.each(protectedRoutes)('%s lets exactly the right roles through', async (route, access) => {
      for (const role of ['CLASS_MASTER', 'TEACHER', 'STUDENT'] as RoleName[]) {
        const allowed = access === 'any' || access.includes(role);
        if (allowed && NOT_PROBED_AS_ALLOWED.has(route)) continue;
        const { status } = await request(route, tokens[role]);
        if (allowed) {
          // Past the permission check: it may then fail on the made-up id or the empty body, but not on permission.
          expect({ role, status, passedTheGate: status !== 401 && status !== 403 && status < 500 }).toEqual({ role, status, passedTheGate: true });
        } else {
          expect({ role, status }).toEqual({ role, status: 403 });
        }
      }
    });

    it('refuses a token for an account that no longer exists', async () => {
      const forged = tokens.STUDENT.slice(0, -4) + 'AAAA';
      expect((await api.get('/students/me', forged)).status).toBe(401);
    });
  });
});
