# CLASSHUB

A class-management system for **one class: 3C Morning Boys**. It keeps students, teachers and subjects, runs exams and assignments, takes marks through a review workflow, publishes results, and produces reports. It runs on one computer with PostgreSQL and a local folder for files. It needs no internet connection and no outside service.

- **Backend:** NestJS 11, TypeORM 0.3, PostgreSQL, JWT, argon2id
- **Frontend:** React 19, TypeScript, Vite 7, Tailwind CSS 4, TanStack Query
- **Package manager:** Bun, for both apps

Nothing is pre-filled. A new database is empty. You create the first Class Master in the setup wizard, then add subjects, teachers and students yourself.

---

## Contents

1. [What it does](#what-it-does)
2. [Requirements](#requirements)
3. [Installation](#installation)
4. [First run: the setup wizard](#first-run-the-setup-wizard)
5. [Running it every day](#running-it-every-day)
6. [Roles and the marks workflow](#roles-and-the-marks-workflow)
7. [Configuration](#configuration)
8. [Backups and restore](#backups-and-restore)
9. [Things to know](#things-to-know)
10. [Tests](#tests)
11. [Project layout](#project-layout)
12. [API](#api)
13. [Troubleshooting](#troubleshooting)

---

## What it does

| Area | What you get |
| --- | --- |
| People | Class Master creates every teacher and student account. There is no self-registration. Photos, status (active or suspended), soft removal and restore. |
| Subjects | Created by the Class Master. Teachers are linked to the subjects they teach. |
| Examinations | The Class Master creates an examination with its subjects and maximum marks. |
| Marks | Teachers enter marks only for their own subjects, submit the sheet, the Class Master approves or rejects it, then publishes. Students see only their own published results. |
| Grading | Configurable actual-mark ranges and scale maximums. Exactly one scale is active at a time. |
| Assignments | Teachers post assignments for their own subjects, with attachments. Students hand in a written answer, a file, or both, and the teacher grades the work. The Class Master can open or close an assignment. |
| Announcements | For everyone, teachers only, or students only. Pinning, drafts and expiry dates. |
| Reports | Real data only, as PDF or CSV: examination results, student, subject and class performance, rankings, assignment performance, teacher subjects, and each student's own report. |
| Dashboards | A different home page for each of the three roles, computed from the database. |
| Audit log | Who did what and when: sign-ins, account changes, marks, publishing, backups. Class Master only. |
| Backups | One-click PostgreSQL backups, download, upload, and restore with safeguards. |
| Interface | Responsive, with dark and light mode, and loading, error and empty states everywhere. Fonts are bundled, so nothing is fetched from the internet. |

There are exactly three roles: `CLASS_MASTER`, `TEACHER` and `STUDENT`. There is no admin role, no monitor role and no parent account. There is deliberately **no attendance module and no lesson-content module**.

---

## Requirements

| Software | Version it was built and tested on | Notes |
| --- | --- | --- |
| [Bun](https://bun.sh) | 1.4 | Installs dependencies and runs the scripts. |
| [Node.js](https://nodejs.org) | 22 LTS | Runs the compiled backend (`bun run start:prod`). |
| PostgreSQL | 16 | The server, plus the client tools `pg_dump` and `pg_restore`, which backups need. |

PostgreSQL must be able to create the `pgcrypto` extension. It ships with PostgreSQL, and from version 13 the owner of a database can create it. On some Linux distributions it is in a separate package (`postgresql-contrib`).

---

## Installation

The steps below are for a development setup. [Running it every day](#running-it-every-day) shows how to serve everything from one process.

### 1. Create the database

Open a PostgreSQL shell as a superuser (Linux: `sudo -u postgres psql`; Windows: *SQL Shell (psql)*):

```sql
CREATE ROLE classhub WITH LOGIN PASSWORD 'choose-a-password' CREATEDB;
CREATE DATABASE classhub OWNER classhub;
```

`CREATEDB` is needed only so the test suite can create its own scratch database. If you do not want to give it, drop that word and create the scratch database by hand: `CREATE DATABASE classhub_e2e OWNER classhub;`.

If the first start fails with a `pgcrypto` permission error, connect to `classhub` as a superuser and run `CREATE EXTENSION IF NOT EXISTS pgcrypto;`.

### 2. Configure and start the backend

```bash
cd backend
cp .env.example .env        # Windows: copy .env.example .env
```

Edit `backend/.env`:

- `DB_PASSWORD` is the password you chose above.
- `JWT_SECRET` must be a long random value. Generate one with `openssl rand -hex 48`, or any random string of at least 32 characters.

Then:

```bash
bun install
bun run start:dev           # http://localhost:3000/api/v1
```

On the first start TypeORM creates all the tables. They stay empty.

### 3. Start the frontend

In a second terminal:

```bash
cd frontend
bun install
bun run dev                 # http://localhost:5173
```

The dev server forwards `/api` to `http://localhost:3000`. If the backend runs elsewhere, set `VITE_DEV_API` before starting it.

Open **http://localhost:5173**. On a new database you are taken to the setup wizard.

---

## First run: the setup wizard

While no Class Master exists, every page leads to `/setup`. The wizard asks for:

- full name
- username (letters, numbers, dot, underscore, dash)
- email (optional)
- a password of at least 8 characters with a letter and a number, entered twice

It runs once. It is safe against two people submitting at the same moment: exactly one request wins. After that the wizard is closed for good, and the endpoint answers that setup is already complete. Setup creates the class settings and the first Class Master. It adds nothing else.

Then, as the Class Master, a sensible order is:

1. **Subjects** (Physics, Mathematics, and so on). You type them in. None are pre-created.
2. **Teachers**, then link each teacher to their subjects.
3. **Students.** Each gets a Student ID such as `ST-001`.
4. **Grading scales.** Create a scale with its bands and activate it.
5. **Settings.** Set the academic year and current period, and choose whether students may hand in work.
6. **Examinations** and **Assignments**.

---

## Running it every day

### One process, one address (recommended for a real install)

Build both apps, and let the backend serve the built frontend:

```bash
cd frontend && bun install && bun run build
cd ../backend && bun install && bun run build
```

In `backend/.env` set:

```
NODE_ENV=production
FRONTEND_DIST=../frontend/dist
```

Then start it:

```bash
cd backend
bun run start:prod          # http://localhost:3000
```

Everyone uses **http://localhost:3000**. The backend listens on all network interfaces, so other devices on the same network can open `http://<this-computer's-address>:3000`. Allow port 3000 through the operating system's firewall if asked.

`NODE_ENV=production` has two effects. The Swagger page is turned off, and the app refuses to start if `JWT_SECRET` still has the placeholder value from `.env.example`.

Starting the program automatically when the computer turns on is not included. Use your system's service manager (systemd, Windows Task Scheduler, or similar).

### Updating to a newer version

1. In the app, open **Backups** and make a backup. Also copy the `backend/storage` folder.
2. Stop the backend.
3. Replace the code, then run `bun install` and `bun run build` in both folders.
4. Start the backend.

See [Schema synchronization](#schema-synchronization) before updating to a version that changes the data model.

---

## Roles and the marks workflow

| | Class Master | Teacher | Student |
| --- | :---: | :---: | :---: |
| Create and manage students, teachers, subjects | yes | | |
| Link teachers to subjects | yes | | |
| Create examinations and grading scales | yes | | |
| Enter marks | | own subjects only | |
| Approve, reject and publish marks | yes | | |
| See student lists and student details | yes | yes | |
| Create and edit assignments | | own subjects | |
| Open or close an assignment | yes | yes | |
| Hand in work | | | yes |
| Grade submitted work | | yes | |
| See results | all | | own published results only |
| Announcements | create and manage | read | read |
| Reports | all | subject and assignment performance | own report only |
| Backups, audit log, settings | yes | | |

The server enforces every rule. Hiding a menu item is only a convenience.

**Marks workflow**

```
Class Master creates the examination
        -> Teacher enters marks for their subject
        -> Teacher submits the sheet (it locks)
        -> Class Master approves, or rejects with a reason
              rejected: the teacher fixes it and submits again
        -> Class Master publishes the examination
        -> Students see their own results
```

A sheet cannot be submitted until every student in the class has either a score or an absent flag. Publishing freezes each student's result. Later changes to a student's record do not change a published result.

---

## Configuration

All settings live in `backend/.env`. The application validates them at start-up and stops with a clear message if one is wrong.

| Variable | Default | Meaning |
| --- | --- | --- |
| `NODE_ENV` | `development` | `production` turns Swagger off and rejects the placeholder `JWT_SECRET`. |
| `PORT` | `3000` | Port the API (and the built frontend) listens on. |
| `DB_HOST`, `DB_PORT` | `localhost`, `5432` | PostgreSQL server. |
| `DB_USERNAME`, `DB_PASSWORD`, `DB_DATABASE` | none | Required. Use the role and database from the installation step. |
| `JWT_SECRET` | none | Required. At least 32 random characters. Keep it private. Changing it signs everyone out. |
| `JWT_EXPIRES_IN` | `12h` | How long a sign-in lasts. |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated origins allowed to call the API from a browser. This matters only when the frontend is served from a different address than the API, as with the dev server. |
| `STORAGE_PATH` | `./storage` | Where uploads, generated reports and backups are kept. |
| `MAX_UPLOAD_MB` | `10` | Largest file a user may upload. |
| `LOGIN_MAX_FAILED_ATTEMPTS` | `5` | Wrong sign-ins before an account is locked. |
| `LOGIN_LOCK_MINUTES` | `15` | How long a lock lasts. |
| `TRUST_PROXY` | `0` | Number of reverse proxies you control in front of the API. Leave at `0` unless you run one. A wrong value lets people fake their IP address and avoid rate limits. |
| `PDF_FONT_REGULAR`, `PDF_FONT_BOLD` | none | Optional TrueType fonts for PDF reports that must show Arabic or other non-Latin names. |
| `PG_DUMP_PATH`, `PG_RESTORE_PATH` | `pg_dump`, `pg_restore` | Full paths to the tools if they are not on the `PATH`. Common on Windows, for example `C:\Program Files\PostgreSQL\16\bin\pg_dump.exe`. |
| `MAX_BACKUP_UPLOAD_MB` | `1024` | Largest backup file accepted for restore. |
| `FRONTEND_DIST` | none | Path to `frontend/dist`. When set, the backend serves the app as well. |

The frontend has one optional setting in `frontend/.env`: `VITE_API_URL` (default `/api/v1`). The default is right for both the dev server and the single-process setup.

### Sign-in and passwords

- **Students** sign in with their **full name and Student ID**. They have no password. Teachers and the Class Master sign in with a username or email and a password.
- A failed sign-in always returns the same message, so nobody can tell whether a name or an ID exists.
- After `LOGIN_MAX_FAILED_ATTEMPTS` wrong attempts the account is locked for `LOGIN_LOCK_MINUTES`. The lock lifts by itself. Resetting a teacher's password also clears it. Sign-in endpoints are also rate-limited per IP address.
- Passwords are stored as argon2id hashes. A password must have at least 8 characters, a letter and a number.
- Changing a password, or having it reset, signs the account out on every other device.

---

## Backups and restore

Only the Class Master can use **Backups**.

- **Make backup** runs `pg_dump` and stores the file in `storage/backups`, together with a small `.json` description file next to it. The list shows each backup's name, kind (manual, uploaded or *before restore*), date, who made it and its size. A backup whose file has gone missing from the folder is flagged.
- **Download** and **Upload** move a backup between computers. **Delete** removes one you no longer need.
- **Restore** needs your password and the word `RESTORE` typed in. It then:
  1. checks the file against its checksum and confirms it is a CLASSHUB backup;
  2. makes an automatic safety backup of the current data, marked *before restore*;
  3. puts the application into maintenance mode (other requests get `503` for the moment);
  4. restores in **one transaction**. If anything fails, everything rolls back and the data stays as it was;
  5. re-applies the schema and writes an audit entry.
- If the `backups` list ever disagrees with the folder, the description files are used to rebuild it at start-up. Copying a `storage` folder to a new computer therefore brings its backups along.

**What a backup does not contain.** A backup is a copy of the **database** only. Uploaded files (profile photos, assignment attachments, student submissions) and generated reports are in `storage/`. To protect them, copy the `backend/storage` folder as well. After a restore, the audit log is the log from the moment of the backup. The restore itself is recorded afterwards.

Keep copies of backups somewhere other than the computer that runs CLASSHUB, such as a USB drive.

---

## Things to know

### Schema synchronization

The database structure is managed by TypeORM with `synchronize: true`. There are no migration files. When the app starts it makes the tables match the entity classes.

This is convenient and it is also the risk. If a developer **renames or removes** a property on an entity, synchronization can drop the matching column or table together with its data. On a database that holds real records, always make a backup (and copy `storage`) before running a new version of the code. Adding columns, tables and indexes is safe.

### Absent students

A student marked absent counts as **0** when totals, averages, ranks and standings are calculated. The absent flag still shows on the sheet and the result, so the record keeps the difference between "scored 0" and "absent".

### Removed students and teachers

Removing a person is a soft removal. They can no longer sign in and no longer appear in current lists. Their marks and submissions are kept. A removed student leaves marks sheets that are still being worked on, but **published results stay exactly as published**, and reports built from published results still include their row. The Class Master can restore a removed person.

### Reports

Reports use **published results only**. PDF and CSV come from the same data, so the numbers match. The built-in PDF font covers Latin letters. Names in Arabic or other scripts need `PDF_FONT_REGULAR` and `PDF_FONT_BOLD` pointing at a suitable font. CSV files always keep every character.

### Files

Uploads are checked by their real content, not just by file name. Allowed types are JPEG, PNG and WebP images, PDF, Word, Excel, PowerPoint, ZIP, TXT and CSV, up to `MAX_UPLOAD_MB`. Files are stored under random names. Only people allowed to see a file can download it.

### Harmless warning at start-up

You may see `DeprecationWarning: Calling client.query() when the client is already executing a query`. It comes from inside TypeORM's schema synchronization and is not caused by CLASSHUB's own code. It does not affect anything.

---

## Tests

Backend, from `backend/`:

```bash
bun run test        # unit tests (59), no database needed
bun run test:e2e    # end-to-end tests (579 in 10 files), needs PostgreSQL
bun run typecheck
```

Frontend, from `frontend/`:

```bash
bun run test        # 76 tests
bun run typecheck
bun run build
```

**The end-to-end tests never touch your real database.** They use a separate scratch database named `classhub_e2e`. The name is fixed in `backend/test/support/test-app.ts`, not read from `.env`. The tests create it if your PostgreSQL user has `CREATEDB`, and otherwise you create it as shown in [Installation](#installation). Its tables are wiped at the start of every test file. They start the real application, with every module, guard and filter, on a random port, and use temporary storage folders.

What they cover:

- **Authentication.** Setup wizard, every sign-in path, lockout, rate limits, password changes, and token revocation.
- **RBAC.** One table lists all 110 routes. The test checks that the table matches the routes the server really has, that every route rejects a missing token, and that exactly the allowed roles get through.
- **Database.** All 19 tables exist and are empty after install. There is no migrations table and no seed data. Uniqueness and foreign-key rules are enforced by PostgreSQL itself. Records survive an application restart.
- **Academic features.** Subjects, teachers, students, examinations, the full marks workflow, grading, results and standings, assignments and submissions, announcements, reports, the dashboard and backups.
- **Offline and repository rules.** There are no CDN links or outbound calls, no Prisma, Docker, migration or seed files, and no `synchronize: false`. Every feature has its own folder, there are no TODO markers, and `.env.example` documents every setting.

---

## Project layout

```
CLASSHUB/
├── backend/
│   ├── src/
│   │   ├── <feature>/            one folder per feature, for example students/
│   │   │   ├── students.module.ts
│   │   │   ├── students.controller.ts
│   │   │   ├── students.service.ts
│   │   │   ├── students.entity.ts
│   │   │   ├── dto/              request shapes and validation
│   │   │   └── types/            response and internal types
│   │   ├── common/               decorators, filters, enums, pagination
│   │   ├── config/               environment validation, database options
│   │   └── database/             naming strategy, shared id and timestamp base
│   ├── test/                     end-to-end tests and their helpers
│   └── storage/                  uploads, reports and backups (created at run time)
└── frontend/
    └── src/
        ├── features/             one folder per screen group
        ├── components/           shared interface pieces
        ├── auth/                 session, route guards
        ├── layout/               app shell and navigation
        └── lib/                  API client, formatting, list state
```

The features are: `auth`, `setup`, `users`, `students`, `teachers`, `subjects`, `teacher-subjects`, `settings`, `examinations`, `marks`, `results`, `grading`, `assignments`, `submissions`, `announcements`, `files`, `reports`, `dashboard`, `audit-logs`, `backups`.

---

## API

- Base path: `/api/v1`
- Interactive documentation (Swagger): `http://localhost:3000/api/docs`. It is turned off when `NODE_ENV=production`.
- Every response is wrapped. Success: `{ "success": true, "data": ..., "meta": { page, limit, total, totalPages } }`. Failure: `{ "success": false, "statusCode", "error", "message", "errors"?, "path", "timestamp" }`.
- Send the token as `Authorization: Bearer <token>`.
- Every route needs a signed-in user unless it is marked public (setup, sign-in). Role rules apply on top.

---

## Troubleshooting

| Symptom | Likely cause and fix |
| --- | --- |
| `Invalid environment configuration` at start | A value in `backend/.env` is missing or wrong. The message lists which. Compare with `.env.example`. |
| `JWT_SECRET still has the placeholder value` | Running with `NODE_ENV=production` and the example secret. Set a real one. |
| `ECONNREFUSED` or `password authentication failed` | PostgreSQL is not running, or `DB_*` does not match the role and database you created. |
| `database "classhub" does not exist` | Create the database named by `DB_DATABASE` in `backend/.env` (for example, `CREATE DATABASE classhub OWNER postgres;` when `DB_USERNAME=postgres`). |
| `permission denied to create extension "pgcrypto"` | Run `CREATE EXTENSION IF NOT EXISTS pgcrypto;` once in the `classhub` database as a superuser. |
| The Backups page says the tools are missing | Install the PostgreSQL client tools, or set `PG_DUMP_PATH` and `PG_RESTORE_PATH` in `.env`. |
| The page shows "Cannot reach the CLASSHUB server" | The backend is not running, or the browser is on a different address than `CORS_ORIGINS` allows (dev server only). |
| Port 3000 is already in use | Change `PORT` in `.env`. For the dev frontend, also set `VITE_DEV_API`. |
| Someone is locked out | Wait `LOGIN_LOCK_MINUTES`. For a teacher, resetting their password clears it at once. |
| PDF shows boxes or blanks instead of names | The name uses a script the built-in font lacks. Set `PDF_FONT_REGULAR` and `PDF_FONT_BOLD`, or use CSV. |
| End-to-end tests cannot create `classhub_e2e` | The PostgreSQL user lacks `CREATEDB`. Create the database by hand as shown in [Installation](#installation). |
#   C l a s s H u b  
 