import { DataSource } from 'typeorm';
import { AccountStatus } from '../common/enums/account-status.enum';
import { Role } from '../common/enums/role.enum';
import { FileRecord } from '../files/files.entity';
import { Student } from '../students/students.entity';
import { Teacher } from '../teachers/teachers.entity';
import { User } from '../users/users.entity';

const STUDENTS = [
  { studentId: '9299', fullName: 'Abdalle Ali Abdillahi Abdi' },
  { studentId: '9350', fullName: 'Abdifatah Adem Yusuf Abdillahi' },
  { studentId: '11346', fullName: 'Abdifatah Ahmed Mohamed' },
  { studentId: '9322', fullName: 'Abdikani Omar Sugulle Omar' },
  { studentId: '9332', fullName: 'Abdillahi Abdi Mohamed Arab' },
  { studentId: '9945', fullName: 'Abdillahi Saed Abdillahi Hurre' },
  { studentId: '9273', fullName: 'Abdinasir Osman Mohamed' },
  { studentId: '9286', fullName: 'Abdiqani Quraysh Abdi Farah' },
  { studentId: '9346', fullName: 'Abdirahim Mohamed Dahir Elmi' },
  { studentId: '9366', fullName: 'Abdirahman Mohamed Adarre' },
  { studentId: '9328', fullName: 'Abdirahman Mouse Mohj' },
  { studentId: '9725', fullName: 'Abdirisak Mukhtar Abdi Omar' },
  { studentId: '9554', fullName: 'Abdiwadud Yusuf Diria Ibrahim' },
  { studentId: '9389', fullName: 'Abokor Kayse Mohamed Ali' },
  { studentId: '10143', fullName: 'Ahmed Ibrahim Ahmed Omer' },
  { studentId: '11480', fullName: 'Almis Mohamoud Faarah Elmi' },
  { studentId: '9708', fullName: 'Amin Ismail Arab Muhumed' },
  { studentId: '10187', fullName: 'Anas Abdirahman Omer Doodi' },
  { studentId: '12442', fullName: 'Awale Yousuf Haibe Geele' },
  { studentId: '9301', fullName: 'Guled Mohamed Ismail Kibar' },
  { studentId: '11044', fullName: 'Hamse Abdirahman Ali Yusuf' },
  { studentId: '9345', fullName: 'Hamse Ismail Mohamed Ahmed' },
  { studentId: '9801', fullName: 'Hashim Mubarig Adan' },
  { studentId: '9330', fullName: 'Hudayfi Abdiqadir H.Abdi' },
  { studentId: '9952', fullName: 'Ibrahim Hassan Muhumed Badel' },
  { studentId: '9288', fullName: 'Ismail Ahmed Abdillahi Yasin' },
  { studentId: '9263', fullName: 'Jama Mustafe Jama Qabile' },
  { studentId: '9800', fullName: 'Khadar Faisal Ahmed Ali' },
  { studentId: '9372', fullName: 'Khalid Abshir Mohamoud' },
  { studentId: '9798', fullName: 'Khalid Faisal Ahmed Ali' },
  { studentId: '9300', fullName: 'Mohamed Abdalle Osman Ali' },
  { studentId: '9270', fullName: 'Mohamed Abdirahman Aabi' },
  { studentId: '9344', fullName: 'Mohamed Iid Mohamed' },
  { studentId: '9381', fullName: 'Mohamed Ismail Ibrahim Ahmed' },
  { studentId: '9524', fullName: 'Muhiyadin Mukhtar Mohamed' },
  { studentId: '9310', fullName: 'Noradin Abdinassir Abib Ismail' },
  { studentId: '11233', fullName: 'Ridwan Salah Mouse Hassan' },
  { studentId: '12468', fullName: 'Sacad Siyad Hussein Ismail' },
  { studentId: '9334', fullName: 'Saed Awale Abdillahi Ahmed' },
  { studentId: '9260', fullName: 'Sakaria Ali Yusuf Esse' },
  { studentId: '9323', fullName: 'Shakib Abdi Shucayb Ali' },
  { studentId: '9308', fullName: 'Shuhab Ali Ismail Hussein' },
  { studentId: '11379', fullName: 'Suhaib Omer Mohamed Egeh' },
  { studentId: '11234', fullName: 'Suldan Bashir Mohamed Nouh' },
  { studentId: '9946', fullName: 'Warsame Abdillahi Ali Ahmed' },
  { studentId: '9005', fullName: 'Yakoub Idiris Aden Abdilahi' },
  { studentId: '11471', fullName: 'Yousuf Ahmed Yousuf Yasin' },
  { studentId: '12423', fullName: 'Yusof Mohamed Ali Heeban' },
  { studentId: '9266', fullName: 'Yusuf Omar Abdi Abdillahi' },
] as const;

async function seedStudents(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL must point to the existing Neon database.');
  }

  const databaseUrl = new URL(connectionString);
  if (
    !['postgres:', 'postgresql:'].includes(databaseUrl.protocol) ||
    !databaseUrl.hostname.endsWith('.neon.tech') ||
    databaseUrl.pathname !== '/neondb'
  ) {
    throw new Error('Refusing to seed: DATABASE_URL must connect to the existing Neon neondb database.');
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

    for (const tableName of ['public.students', 'public.users']) {
      const [{ tableExists }] = await dataSource.query('SELECT to_regclass($1) IS NOT NULL AS "tableExists"', [tableName]);
      if (!tableExists) {
        throw new Error(`Refusing to create or synchronize schema: ${tableName} does not exist in neondb.`);
      }
    }

    const inserted: string[] = [];
    const skipped: string[] = [];
    const failed: Array<{ studentId: string; reason: string }> = [];
    for (const record of STUDENTS) {
      try {
        const outcome = await dataSource.transaction(async (manager) => {
          await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`classhub-student-seed:${record.studentId}`]);

          const students = manager.getRepository(Student);
          const existingStudent = await students
            .createQueryBuilder('student')
            .withDeleted()
            .leftJoinAndSelect('student.user', 'user')
            .where('student.studentId = :studentId', { studentId: record.studentId })
            .getOne();

          if (existingStudent) {
            if (existingStudent.user?.fullName === record.fullName) {
              return 'skipped' as const;
            }
            throw new Error(`student ID ${record.studentId} already exists with a different name.`);
          }

          const user = await manager.getRepository(User).save(
            manager.getRepository(User).create({
              role: Role.STUDENT,
              fullName: record.fullName,
              username: null,
              email: null,
              passwordHash: null,
              status: AccountStatus.ACTIVE,
              failedLoginAttempts: 0,
              lockedUntil: null,
              lastLoginAt: null,
              tokenVersion: 0,
            }),
          );

          await students.save(
            students.create({
              userId: user.id,
              studentId: record.studentId,
              gender: null,
              dateOfBirth: null,
              phone: null,
              email: null,
              address: null,
              notes: null,
              profilePhotoId: null,
            }),
          );

          return 'inserted' as const;
        });

        (outcome === 'inserted' ? inserted : skipped).push(record.studentId);
      } catch (error) {
        failed.push({
          studentId: record.studentId,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const verified = await dataSource
      .getRepository(Student)
      .createQueryBuilder('student')
      .withDeleted()
      .leftJoinAndSelect('student.user', 'user')
      .where('student.studentId IN (:...studentIds)', { studentIds: STUDENTS.map(({ studentId }) => studentId) })
      .getMany();
    const verifiedById = new Map(verified.map((student) => [student.studentId, student]));
    const mismatches = STUDENTS.filter(
      (record) => verifiedById.get(record.studentId)?.user?.fullName !== record.fullName,
    ).map(({ studentId }) => studentId);

    console.log(
      JSON.stringify(
        {
          database,
          table: 'public.students',
          requested: STUDENTS.length,
          inserted: inserted.length,
          skippedExisting: skipped.length,
          failed,
          verifiedExactIdAndNameCount: STUDENTS.length - mismatches.length,
          verificationMismatches: mismatches,
        },
        null,
        2,
      ),
    );

    if (failed.length > 0 || mismatches.length > 0) {
      process.exitCode = 1;
    }
  } finally {
    await dataSource.destroy();
  }
}

seedStudents().catch((error: unknown) => {
  console.error('Student seeding failed:', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
