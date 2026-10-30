import { Api, expectStatus, futureIso, sleep } from './support/api';
import { create, createTestApp, setUpClassMaster, TestApp } from './support/test-app';

describe('Announcements', () => {
  let t: TestApp;
  let api: Api;
  let cm: string;
  let T1: string;
  let S1: string;
  let aAll: string;
  let aStudents: string;
  let aTeachers: string;
  let aDraft: string;
  let aShort: string;

  const titles = (r: { json: { data: { title: string }[] } }) => r.json.data.map((a) => a.title);

  beforeAll(async () => {
    t = await createTestApp(4);
    api = t.api;
    cm = await setUpClassMaster(api);
    await create(api, cm, '/teachers', { fullName: 'Teacher Physics', username: 'tphys', password: 'Teach1234' });
    await create(api, cm, '/students', { fullName: 'Student One', studentId: 'ST-001' });
    T1 = await api.login('/auth/teacher-login', { identifier: 'tphys', password: 'Teach1234' });
    S1 = await api.login('/auth/student-login', { fullName: 'Student One', studentId: 'ST-001' });
  });

  afterAll(async () => {
    await t.close();
  });

  it('starts with none: nothing is seeded', async () => {
    const r = await api.get('/announcements', S1);
    expectStatus(r, 200);
    expect(r.json.data).toHaveLength(0);
  });

  describe('creating', () => {
    it('is for the Class Master only', async () => {
      expect((await api.post('/announcements', T1, { title: 'Hello all', body: 'Welcome back' })).status).toBe(403);
      expect((await api.post('/announcements', S1, { title: 'Hello all', body: 'Welcome back' })).status).toBe(403);
    });

    it('refuses a title that is too short', async () => {
      expect((await api.post('/announcements', cm, { title: 'x', body: 'short title' })).status).toBe(400);
    });

    it('refuses an expiry in the past', async () => {
      expect((await api.post('/announcements', cm, { title: 'Past expiry', body: 'text here', expiresAt: futureIso(-60_000) })).status).toBe(400);
    });

    it('publishes one for everyone, with its author and publish time', async () => {
      const r = await api.post('/announcements', cm, { title: 'For everyone', body: 'School closes Friday.' });
      expectStatus(r, 201);
      expect(r.json.data).toMatchObject({ state: 'ACTIVE', audience: 'ALL', authorName: 'Amina Yusuf' });
      expect(r.json.data.publishedAt).toBeTruthy();
      aAll = r.json.data.id;
    });

    it('creates audience-specific, pinned, draft and short-lived ones', async () => {
      aStudents = (await api.post('/announcements', cm, { title: 'Students only', body: 'Bring your books.', audience: 'STUDENTS' })).json.data.id;
      aTeachers = (await api.post('/announcements', cm, { title: 'Teachers only', body: 'Staff meeting at 9.', audience: 'TEACHERS', isPinned: true })).json.data.id;
      const draft = await api.post('/announcements', cm, { title: 'Secret draft', body: 'Not ready yet.', isPublished: false });
      expectStatus(draft, 201);
      expect(draft.json.data).toMatchObject({ state: 'DRAFT', publishedAt: null });
      aDraft = draft.json.data.id;
      aShort = (await api.post('/announcements', cm, { title: 'Short lived', body: 'Gone in seconds.', expiresAt: futureIso(2500) })).json.data.id;
    });
  });

  describe('who sees what', () => {
    it('shows students the announcements for all and for students, never drafts or staff-only ones', async () => {
      const list = titles(await api.get('/announcements', S1));
      expect(list).toEqual(expect.arrayContaining(['For everyone', 'Students only']));
      expect(list).not.toContain('Teachers only');
      expect(list).not.toContain('Secret draft');
    });

    it('shows teachers theirs, with the pinned one first', async () => {
      const list = titles(await api.get('/announcements', T1));
      expect(list[0]).toBe('Teachers only');
      expect(list).toContain('For everyone');
      expect(list).not.toContain('Students only');
      expect(list).not.toContain('Secret draft');
    });

    it('shows the Class Master all five, including the draft', async () => {
      expect((await api.get('/announcements', cm)).json.meta.total).toBe(5);
    });

    it('answers 404 for things a person may not see', async () => {
      expect((await api.get(`/announcements/${aTeachers}`, S1)).status).toBe(404);
      expect((await api.get(`/announcements/${aDraft}`, T1)).status).toBe(404);
    });

    it('lets the Class Master open a draft', async () => {
      const r = await api.get(`/announcements/${aDraft}`, cm);
      expectStatus(r, 200);
      expect(r.json.data.state).toBe('DRAFT');
    });

    it('filters by state, audience and text', async () => {
      expect((await api.get('/announcements?state=DRAFT', cm)).json.data.map((a: { id: string }) => a.id)).toEqual([aDraft]);
      expect((await api.get('/announcements?audience=TEACHERS', cm)).json.data.map((a: { id: string }) => a.id)).toEqual([aTeachers]);
      expect((await api.get('/announcements?search=books', cm)).json.data.map((a: { id: string }) => a.id)).toEqual([aStudents]);
    });

    it('does not let a student widen what they see with the state filter', async () => {
      const r = await api.get('/announcements?state=DRAFT', S1);
      expect(r.json.data.every((a: { title: string }) => a.title !== 'Secret draft')).toBe(true);
    });

    it('matches a % in the search literally', async () => {
      const r = await api.get('/announcements?search=%25', cm);
      expectStatus(r, 200);
      expect(r.json.data).toHaveLength(0);
    });
  });

  describe('changing', () => {
    it('is for the Class Master only', async () => {
      expect((await api.patch(`/announcements/${aDraft}`, T1, { isPublished: true })).status).toBe(403);
    });

    it('publishes a draft, then hides it again', async () => {
      const published = await api.patch(`/announcements/${aDraft}`, cm, { isPublished: true });
      expect(published.json.data).toMatchObject({ state: 'ACTIVE' });
      expect(published.json.data.publishedAt).toBeTruthy();
      expect((await api.get(`/announcements/${aDraft}`, S1)).status).toBe(200);
      const hidden = await api.patch(`/announcements/${aDraft}`, cm, { isPublished: false });
      expect(hidden.json.data).toMatchObject({ state: 'DRAFT', publishedAt: null });
      expect((await api.get(`/announcements/${aDraft}`, S1)).status).toBe(404);
    });

    it('pins and retitles, and a pinned one is listed first', async () => {
      const r = await api.patch(`/announcements/${aAll}`, cm, { isPinned: true, title: 'For everyone (updated)' });
      expect(r.json.data).toMatchObject({ isPinned: true, title: 'For everyone (updated)' });
      expect((await api.get('/announcements', S1)).json.data[0].id).toBe(aAll);
    });
  });

  describe('expiry', () => {
    it('removes an expired announcement from students but not from the Class Master', async () => {
      await sleep(2800);
      expect((await api.get('/announcements', S1)).json.data.some((a: { id: string }) => a.id === aShort)).toBe(false);
      expect((await api.get(`/announcements/${aShort}`, S1)).status).toBe(404);
      const cmView = await api.get(`/announcements/${aShort}`, cm);
      expect(cmView.json.data.state).toBe('EXPIRED');
      expect((await api.get('/announcements?state=EXPIRED', cm)).json.data).toHaveLength(1);
    });

    it('will not republish with an expiry that has already passed, but will once the expiry is cleared', async () => {
      await api.patch(`/announcements/${aShort}`, cm, { isPublished: false });
      expect((await api.patch(`/announcements/${aShort}`, cm, { isPublished: true })).status).toBe(400);
      const r = await api.patch(`/announcements/${aShort}`, cm, { isPublished: true, expiresAt: null });
      expectStatus(r, 200);
      expect(r.json.data).toMatchObject({ state: 'ACTIVE', expiresAt: null });
    });
  });

  describe('deleting', () => {
    it('is for the Class Master only', async () => {
      expect((await api.delete(`/announcements/${aAll}`, T1)).status).toBe(403);
    });

    it('removes an announcement for good', async () => {
      expectStatus(await api.delete(`/announcements/${aShort}`, cm), 200);
      expect((await api.get(`/announcements/${aShort}`, cm)).status).toBe(404);
    });
  });
});
