import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { Api, expectStatus, uploadForm } from './support/api';
import { create, createTestApp, setUpClassMaster, TestApp } from './support/test-app';

/* eslint-disable @typescript-eslint/no-explicit-any */
describe('Backups: create, download, upload and restore', () => {
  let t: TestApp;
  let api: Api;
  let cm: string;
  let T1: string;
  let S1: string;
  let backupsDir: string;
  let A: any;
  let dumpA: Buffer;
  let safety1: any;
  let safety2: any;
  let A2: any;
  let uploaded: any;
  let uploadedStoredName: string;

  const restoreBody = { password: 'Secret123', confirmation: 'RESTORE' };
  const pgEnv = () => ({ ...process.env, PGPASSWORD: t.settings.DB_PASSWORD ?? '' });
  const pgArgs = (database: string) => ['-h', t.settings.DB_HOST ?? 'localhost', '-p', t.settings.DB_PORT ?? '5432', '-U', t.settings.DB_USERNAME as string, '-d', database];
  const uploadBackup = (token: string, name: string, bytes: Buffer, note?: string) => api.call('POST', '/backups/upload', { token, form: uploadForm(note ? { note } : {}, name, bytes) });
  const studentCount = async () => (await api.get('/students', cm)).json.meta.total as number;

  beforeAll(async () => {
    t = await createTestApp(7);
    api = t.api;
    backupsDir = join(t.storagePath, 'backups');
    cm = await setUpClassMaster(api);
    await create(api, cm, '/subjects', { name: 'Physics' });
    await create(api, cm, '/teachers', { fullName: 'Teacher Physics', username: 'tphys', password: 'Teach1234' });
    await create(api, cm, '/students', { fullName: 'Student One', studentId: 'ST-001' });
    await create(api, cm, '/students', { fullName: 'Student Two', studentId: 'ST-002' });
    await create(api, cm, '/announcements', { title: 'Before backup', body: 'This exists in the first backup.' });
    T1 = await api.login('/auth/teacher-login', { identifier: 'tphys', password: 'Teach1234' });
    S1 = await api.login('/auth/student-login', { fullName: 'Student One', studentId: 'ST-001' });
  });

  afterAll(async () => {
    await t.close();
  });

  describe('access', () => {
    it('needs a sign-in', async () => {
      expect((await api.get('/backups')).status).toBe(401);
    });

    it.each([['teacher'], ['student']])('is closed to a %s', async (who) => {
      const token = who === 'teacher' ? T1 : S1;
      expect((await api.get('/backups', token)).status).toBe(403);
      expect((await api.post('/backups', token, {})).status).toBe(403);
    });

    it('reports that PostgreSQL’s backup tools are available, and that none exist yet', async () => {
      const r = await api.get('/backups/status', cm);
      expectStatus(r, 200);
      expect(r.json.data.toolsAvailable).toBe(true);
      expect(r.json.data.pgDumpVersion).toMatch(/^\d+/);
      expect(r.json.data.total).toBe(0);
      expect((await api.get('/backups', cm)).json.data).toHaveLength(0);
    });
  });

  describe('creating and downloading', () => {
    it('creates a backup with a checksum, size and no leaked server paths', async () => {
      const r = await api.post('/backups', cm, { note: 'first' });
      expectStatus(r, 201);
      A = r.json.data;
      expect(A).toMatchObject({ kind: 'MANUAL', fileExists: true, note: 'first', createdByName: 'Amina Yusuf' });
      expect(A.sizeBytes).toBeGreaterThan(1000);
      expect(A.displayName).toMatch(/^classhub-backup-.*\.dump$/);
      expect(A.checksumSha256).toHaveLength(64);
      expect(JSON.stringify(A)).not.toContain('/tmp');
      expect(A).not.toHaveProperty('fileName');
    });

    it('downloads the real dump file', async () => {
      const r = await api.get(`/backups/${A.id}/download`, cm);
      expectStatus(r, 200);
      expect(r.raw.subarray(0, 5).toString()).toBe('PGDMP');
      expect(r.raw.length).toBe(A.sizeBytes);
      expect(r.headers.get('content-disposition')).toMatch(/attachment.*\.dump/);
      dumpA = r.raw;
    });

    it('keeps students from downloading it', async () => {
      expect((await api.get(`/backups/${A.id}/download`, S1)).status).toBe(403);
    });

    it('keeps a catalogue entry in the database', async () => {
      expect((await t.sql('select count(*)::int as n from backups'))[0].n).toBe(1);
    });

    it('lets only one backup run at a time', async () => {
      const [c1, c2] = await Promise.all([api.post('/backups', cm, {}), api.post('/backups', cm, {})]);
      const statuses = [c1.status, c2.status].sort();
      expect(statuses[0]).toBe(201);
      expect([201, 409]).toContain(statuses[1]);
      for (const x of [c1, c2]) if (x.status === 201) await api.delete(`/backups/${x.json.data.id}`, cm);
    });
  });

  describe('restoring', () => {
    beforeAll(async () => {
      await create(api, cm, '/students', { fullName: 'Student Four', studentId: 'ST-004' });
      await create(api, cm, '/announcements', { title: 'After backup', body: 'This was created after the backup.' });
    });

    it('starts from three students', async () => {
      expect(await studentCount()).toBe(3);
    });

    it('is refused for a teacher, a wrong password, a missing confirmation and an unknown backup', async () => {
      expect((await api.post(`/backups/${A.id}/restore`, T1, { password: 'Teach1234', confirmation: 'RESTORE' })).status).toBe(403);
      expect((await api.post(`/backups/${A.id}/restore`, cm, { password: 'wrong-password', confirmation: 'RESTORE' })).status).toBe(403);
      expect((await api.post(`/backups/${A.id}/restore`, cm, { password: 'Secret123', confirmation: 'yes' })).status).toBe(400);
      expect((await api.post(`/backups/${A.id}/restore`, cm, { password: 'Secret123' })).status).toBe(400);
      expect((await api.post('/backups/3f2504e0-4f89-41d3-9a0c-0305e82c3301/restore', cm, restoreBody)).status).toBe(404);
    });

    it('changed nothing when it was refused', async () => {
      expect(await studentCount()).toBe(3);
    });

    it('restores the backup, answering other requests with 503 while it runs', async () => {
      const restoring = api.post(`/backups/${A.id}/restore`, cm, restoreBody);
      const probes: Promise<number>[] = [];
      for (let i = 0; i < 80; i += 1) {
        probes.push(api.get('/settings', cm).then((x) => x.status));
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      const r = await restoring;
      const seen = await Promise.all(probes);
      expectStatus(r, 200);
      expect(r.json.data.restoredFrom.id).toBe(A.id);
      expect(r.json.data.safetyBackup).toMatchObject({ kind: 'PRE_RESTORE', fileExists: true });
      expect(r.json.data.warnings.some((w: string) => w.includes('database only'))).toBe(true);
      expect(seen).toContain(503);
      expect(seen.every((s) => [200, 503, 401].includes(s))).toBe(true);
      safety1 = r.json.data.safetyBackup;
    });

    it('brings the data back to the backup: Student Four and the later announcement are gone', async () => {
      const students = await api.get('/students', cm);
      expect(students.json.meta.total).toBe(2);
      expect(students.json.data.some((s: any) => s.fullName === 'Student Four')).toBe(false);
      const announcements = await api.get('/announcements', cm);
      expect(announcements.json.data.map((a: any) => a.title)).toEqual(['Before backup']);
    });

    it('keeps the backup list: the original and the safety copy', async () => {
      const r = await api.get('/backups', cm);
      expect(r.json.meta.total).toBe(2);
      expect(r.json.data.some((b: any) => b.id === A.id)).toBe(true);
      expect(r.json.data.some((b: any) => b.id === safety1.id && b.kind === 'PRE_RESTORE')).toBe(true);
    });

    it('lets students sign in and the Class Master carry on afterwards', async () => {
      expectStatus(await api.post('/auth/student-login', undefined, { fullName: 'Student One', studentId: 'ST-001' }), 200);
      const settings = await api.get('/settings', cm);
      expectStatus(settings, 200);
      expect(settings.json.data.className).toBe('3C Morning Boys');
    });

    it('leaves the schema intact', async () => {
      const [row] = await t.sql("select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name in ('users','students','backups','audit_logs','app_settings')");
      expect(row.n).toBe(5);
    });

    it('undoes the restore by restoring the safety copy', async () => {
      const r = await api.post(`/backups/${safety1.id}/restore`, cm, restoreBody);
      expectStatus(r, 200);
      safety2 = r.json.data.safetyBackup;
      const students = await api.get('/students', cm);
      expect(students.json.meta.total).toBe(3);
      expect(students.json.data.some((s: any) => s.fullName === 'Student Four')).toBe(true);
      expect((await api.get('/announcements', cm)).json.data).toHaveLength(2);
    });

    it('rebuilds a backup’s catalogue entry from the file on disk when the database lost it', async () => {
      await t.sql('delete from backups where id = $1', [A.id]);
      expect((await api.get('/backups', cm)).json.data.some((b: any) => b.id === A.id)).toBe(false);
      expectStatus(await api.post(`/backups/${safety2.id}/restore`, cm, restoreBody), 200);
      const revived = (await api.get('/backups', cm)).json.data.find((b: any) => b.displayName === A.displayName);
      expect(revived).toBeTruthy();
      expect(revived).toMatchObject({ sizeBytes: A.sizeBytes, checksumSha256: A.checksumSha256, note: 'first' });
      A2 = revived;
    });
  });

  describe('uploading a backup made elsewhere', () => {
    it('is closed to teachers and needs a file', async () => {
      expect((await uploadBackup(T1, 'x.dump', dumpA)).status).toBe(403);
      expect((await api.call('POST', '/backups/upload', { token: cm, form: new FormData() })).status).toBe(400);
    });

    it('refuses a text file', async () => {
      const r = await uploadBackup(cm, 'notes.txt', Buffer.from('this is just some text, not a database backup'));
      expect(r.status).toBe(400);
      expect(JSON.stringify(r.json)).toContain('not a PostgreSQL backup');
    });

    it('refuses a damaged dump', async () => {
      const r = await uploadBackup(cm, 'broken.dump', Buffer.concat([Buffer.from('PGDMP'), Buffer.from('garbage garbage garbage')]));
      expect(r.status).toBe(400);
    });

    it('refuses a valid dump of a different database', async () => {
      const other = 'classhub_e2e_other';
      const run = (database: string, sql: string) => execFileSync('psql', [...pgArgs(database), '-At', '-c', sql], { env: pgEnv() });
      try {
        run('postgres', `drop database if exists ${other}`);
        run('postgres', `create database ${other}`);
        run(other, 'create table not_classhub (id int)');
        const file = join(t.storagePath, 'other.dump');
        execFileSync('pg_dump', ['-Fc', ...pgArgs(other), '-f', file], { env: pgEnv() });
        const r = await uploadBackup(cm, 'other.dump', readFileSync(file));
        expect(r.status).toBe(400);
        expect(JSON.stringify(r.json)).toContain('not a CLASSHUB backup');
      } finally {
        run('postgres', `drop database if exists ${other}`);
      }
    });

    it('accepts a real backup with a safe display name and leaves no temporary files', async () => {
      const r = await uploadBackup(cm, '../../evil name.dump', dumpA, 'from another computer');
      expectStatus(r, 201);
      uploaded = r.json.data;
      expect(uploaded).toMatchObject({ kind: 'UPLOADED', note: 'from another computer', sizeBytes: dumpA.length });
      expect(uploaded.displayName).not.toContain('/');
      expect(readdirSync(backupsDir).some((f) => f.endsWith('.upload'))).toBe(false);
    });

    it('filters the list by kind', async () => {
      const r = await api.get('/backups?kind=UPLOADED', cm);
      expect(r.json.data.map((b: any) => b.id)).toEqual([uploaded.id]);
    });

    it('restores an uploaded backup with its data', async () => {
      expectStatus(await api.post(`/backups/${uploaded.id}/restore`, cm, restoreBody), 200);
      expect(await studentCount()).toBe(2);
    });
  });

  describe('tampering and deleting', () => {
    it('refuses a backup file that changed on disk, before touching anything', async () => {
      uploadedStoredName = (await t.sql('select file_name from backups where id = $1', [uploaded.id]))[0].file_name as string;
      appendFileSync(join(backupsDir, uploadedStoredName), 'tampered');
      expect((await api.post(`/backups/${uploaded.id}/restore`, cm, restoreBody)).status).toBe(409);
      expect(await studentCount()).toBe(2);
    });

    it('lets only the Class Master delete a backup, removing both its files', async () => {
      expect((await api.delete(`/backups/${uploaded.id}`, T1)).status).toBe(403);
      expectStatus(await api.delete(`/backups/${uploaded.id}`, cm), 200);
      expect(existsSync(join(backupsDir, uploadedStoredName))).toBe(false);
      expect(existsSync(join(backupsDir, `${uploadedStoredName}.json`))).toBe(false);
      expect((await api.get(`/backups/${uploaded.id}/download`, cm)).status).toBe(404);
    });

    it('flags a backup whose file went missing, and refuses to restore or download it', async () => {
      const stored = (await t.sql('select file_name from backups where id = $1', [A2.id]))[0].file_name as string;
      rmSync(join(backupsDir, stored));
      const list = await api.get('/backups', cm);
      expect(list.json.data.find((b: any) => b.id === A2.id).fileExists).toBe(false);
      expect((await api.post(`/backups/${A2.id}/restore`, cm, restoreBody)).status).toBe(404);
      expect((await api.get(`/backups/${A2.id}/download`, cm)).status).toBe(404);
    });
  });

  describe('status and the audit trail', () => {
    it('reports counts that match the list', async () => {
      const r = await api.get('/backups/status', cm);
      expect(r.json.data.total).toBeGreaterThanOrEqual(2);
      expect(r.json.data.totalSizeBytes).toBeGreaterThan(0);
      expect(r.json.data.latestBackupAt).toBeTruthy();
      expect(r.json.data.busy).toBe(false);
    });

    it('records the restore, the delete and a refused attempt, and never the password', async () => {
      await api.post(`/backups/${A2.id}/restore`, cm, { password: 'nope-nope', confirmation: 'RESTORE' });
      const r = await api.get('/audit-logs?limit=200', cm);
      const actions = new Set<string>(r.json.data.map((a: any) => a.action));
      for (const action of ['BACKUP_RESTORED', 'BACKUP_DELETED', 'BACKUP_FAILED']) expect(actions).toContain(action);
      const text = JSON.stringify(r.json.data);
      expect(text).not.toContain('Secret123');
      expect(text).not.toContain('wrong-password');
    });
  });
});
