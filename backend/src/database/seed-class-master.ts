import { DataSource } from 'typeorm';
import { AccountStatus } from '../common/enums/account-status.enum';
import { Role } from '../common/enums/role.enum';
import { hashPassword, verifyPassword } from '../common/utils/password.util';
import { FileRecord } from '../files/files.entity';
import { Student } from '../students/students.entity';
import { Teacher } from '../teachers/teachers.entity';
import { User } from '../users/users.entity';

const CLASS_MASTER = {
  fullName: 'Abdirisak Abdirashid Muhumed',
  username: 'a.ration',
  email: 'ratio@gmail.com',
};

async function seedClassMaster(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  const password = process.env.CLASS_MASTER_PASSWORD;

  if (!connectionString) {
    throw new Error('DATABASE_URL must point to the existing Neon database.');
  }
  if (!password) {
    throw new Error('Set CLASS_MASTER_PASSWORD in the environment before running this seeder.');
  }

  const databaseUrl = new URL(connectionString);
  if (
    !['postgres:', 'postgresql:'].includes(databaseUrl.protocol) ||
    !databaseUrl.hostname.endsWith('.neon.tech') ||
    databaseUrl.pathname !== '/neondb'
  ) {
    throw new Error('Refusing to seed: DATABASE_URL must connect to the existing neondb database.');
  }
  databaseUrl.searchParams.set('sslmode', 'verify-full');

  const dataSource = new DataSource({
    type: 'postgres',
    url: databaseUrl.toString(),
    ssl: { rejectUnauthorized: true },
    entities: [User, Student, Teacher, FileRecord],
    synchronize: false,
    dropSchema: false,
    migrationsRun: false,
    logging: false,
  });

  await dataSource.initialize();
  try {
    const [{ database }] = await dataSource.query('SELECT current_database() AS database');
    if (database !== 'neondb') {
      throw new Error('Refusing to seed: the connected database is not neondb.');
    }

    const [{ usersTable }] = await dataSource.query("SELECT to_regclass('public.users') AS \"usersTable\"");
    if (!usersTable) {
      throw new Error('Refusing to create or synchronize schema: public.users does not exist in neondb.');
    }

    const username = CLASS_MASTER.username;
    const email = CLASS_MASTER.email;
    const outcome = await dataSource.transaction(async (manager) => {
      await manager.query("SELECT pg_advisory_xact_lock(hashtext('classhub-class-master-seed'))");

      const users = manager.getRepository(User);
      const matches = await users
        .createQueryBuilder('user')
        .withDeleted()
        .where('LOWER(user.username) = :username OR LOWER(user.email) = :email', { username, email })
        .getMany();

      if (matches.length > 0) {
        const existing = matches[0];
        if (
          matches.length === 1 &&
          existing.username?.toLowerCase() === username &&
          existing.email?.toLowerCase() === email &&
          existing.role === Role.CLASS_MASTER
        ) {
          return 'already-existed' as const;
        }

        throw new Error('Refusing to seed: the requested username or email is already used by a different account.');
      }

      const user = users.create({
        role: Role.CLASS_MASTER,
        fullName: CLASS_MASTER.fullName,
        username,
        email,
        passwordHash: await hashPassword(password),
        status: AccountStatus.ACTIVE,
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: null,
        tokenVersion: 0,
      });
      await users.save(user);
      return 'inserted' as const;
    });

    const savedAccount = await dataSource
      .getRepository(User)
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.username = :username AND user.email = :email AND user.role = :role', {
        username,
        email,
        role: Role.CLASS_MASTER,
      })
      .getOne();

    if (!savedAccount?.passwordHash || !(await verifyPassword(savedAccount.passwordHash, password))) {
      throw new Error('The saved Class Master password hash could not be verified.');
    }

    console.log(
      outcome === 'inserted'
        ? 'Class Master inserted into public.users; Argon2id password hash verified.'
        : 'Class Master already exists in public.users; no account fields or password were changed.',
    );
  } finally {
    await dataSource.destroy();
  }
}

seedClassMaster().catch((error: unknown) => {
  console.error('Class Master seeding failed:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
