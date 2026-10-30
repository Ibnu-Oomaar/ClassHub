import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AccountStatus } from '../common/enums/account-status.enum';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { normalizeFullName } from '../common/utils/name.util';
import { Paginated, buildPaginated, skipFor } from '../common/pagination/pagination.util';
import { hashPassword } from '../common/utils/password.util';
import { escapeLike, resolveSort } from '../common/utils/sort.util';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { CreateUserInput, MeView, UserView } from './types/user.types.interface';
import { User } from './users.entity';

const SORTABLE = {
  createdAt: 'user.createdAt',
  fullName: 'user.fullName',
  role: 'user.role',
  status: 'user.status',
  lastLoginAt: 'user.lastLoginAt',
};

/**
 * Owns everything about the login account row: unique identifiers, password hashing, status,
 * soft delete. Students, teachers and the setup wizard all go through here.
 */
@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  /** Creates a login account inside the caller's transaction. */
  async createUser(manager: EntityManager, input: CreateUserInput): Promise<User> {
    const repository = manager.getRepository(User);
    const username = input.username?.trim().toLowerCase() || null;
    const email = input.email?.trim().toLowerCase() || null;

    await this.assertIdentifiersAvailable(manager, { username, email });

    return repository.save(
      repository.create({
        role: input.role,
        fullName: normalizeFullName(input.fullName),
        username,
        email,
        passwordHash: input.password ? await hashPassword(input.password) : null,
        status: input.status ?? AccountStatus.ACTIVE,
      }),
    );
  }

  /**
   * Username and email are unique across ALL accounts, including soft-deleted ones
   * (the database constraint does not ignore them either).
   */
  async assertIdentifiersAvailable(
    manager: EntityManager,
    identifiers: { username?: string | null; email?: string | null },
    excludeUserId?: string,
  ): Promise<void> {
    const { username, email } = identifiers;
    if (!username && !email) return;

    const qb = manager
      .getRepository(User)
      .createQueryBuilder('user')
      .withDeleted()
      .select(['user.id', 'user.username', 'user.email']);

    const conditions: string[] = [];
    if (username) conditions.push('user.username = :username');
    if (email) conditions.push('user.email = :email');
    qb.where(`(${conditions.join(' OR ')})`, { username, email });
    if (excludeUserId) qb.andWhere('user.id <> :excludeUserId', { excludeUserId });

    const existing = await qb.getMany();
    if (username && existing.some((row) => row.username === username)) {
      throw new ConflictException('That username is already taken.');
    }
    if (email && existing.some((row) => row.email === email)) {
      throw new ConflictException('That email is already registered.');
    }
  }

  async findById(id: string, manager?: EntityManager): Promise<User | null> {
    const repository = manager ? manager.getRepository(User) : this.users;
    return repository.findOne({ where: { id } });
  }

  async findByIdOrFail(id: string, manager?: EntityManager): Promise<User> {
    const user = await this.findById(id, manager);
    if (!user) {
      throw new NotFoundException('Account not found.');
    }
    return user;
  }

  /** Looks up a Class Master / Teacher by username or email, including the password hash. */
  findStaffByIdentifier(identifier: string): Promise<User | null> {
    const key = identifier.trim().toLowerCase();
    return this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('(user.username = :key OR user.email = :key)', { key })
      .andWhere('user.role IN (:...roles)', { roles: [Role.CLASS_MASTER, Role.TEACHER] })
      .getOne();
  }

  /**
   * Changes the account status. Suspending/deactivating also invalidates existing tokens;
   * re-activating clears any login lock.
   */
  async setStatus(userId: string, status: AccountStatus, manager?: EntityManager): Promise<void> {
    const repository = (manager ?? this.users.manager).getRepository(User);
    const query = repository
      .createQueryBuilder()
      .update(User)
      .where('id = :userId', { userId });

    if (status === AccountStatus.ACTIVE) {
      query.set({ status, failedLoginAttempts: 0, lockedUntil: null });
    } else {
      query.set({ status, tokenVersion: () => 'token_version + 1' });
    }
    await query.execute();
  }

  async softDelete(userId: string, manager: EntityManager): Promise<void> {
    await manager.getRepository(User).update({ id: userId }, { tokenVersion: () => 'token_version + 1' });
    await manager.getRepository(User).softDelete({ id: userId });
  }

  async restore(userId: string, manager: EntityManager): Promise<void> {
    await manager.getRepository(User).restore({ id: userId });
  }

  async setPasswordHash(userId: string, passwordHash: string, manager?: EntityManager): Promise<void> {
    const repository = (manager ?? this.users.manager).getRepository(User);
    await repository
      .createQueryBuilder()
      .update(User)
      .set({ passwordHash, tokenVersion: () => 'token_version + 1', failedLoginAttempts: 0, lockedUntil: null })
      .where('id = :userId', { userId })
      .execute();
  }

  async list(query: UserQueryDto): Promise<Paginated<UserView>> {
    const qb = this.users.createQueryBuilder('user');

    if (query.role) qb.andWhere('user.role = :role', { role: query.role });
    if (query.status) qb.andWhere('user.status = :status', { status: query.status });
    if (query.search) {
      qb.andWhere(
        `(user.fullName ILIKE :search ESCAPE '\\' OR user.username ILIKE :search ESCAPE '\\' OR user.email ILIKE :search ESCAPE '\\')`,
        { search: `%${escapeLike(query.search)}%` },
      );
    }

    qb.orderBy(resolveSort(query.sortBy, SORTABLE, 'createdAt'), query.sortOrder)
      .addOrderBy('user.id', 'ASC')
      .skip(skipFor(query.page, query.limit))
      .take(query.limit);

    const [rows, total] = await qb.getManyAndCount();
    return buildPaginated(rows.map((row) => this.toView(row)), total, query.page, query.limit);
  }

  async getView(id: string): Promise<UserView> {
    return this.toView(await this.findByIdOrFail(id));
  }

  async getMe(current: AuthenticatedUser): Promise<MeView> {
    const user = await this.users
      .createQueryBuilder('user')
      .leftJoinAndSelect('user.student', 'student')
      .leftJoinAndSelect('user.teacher', 'teacher')
      .where('user.id = :id', { id: current.id })
      .getOne();

    if (!user) {
      throw new NotFoundException('Account not found.');
    }

    return {
      ...this.toView(user),
      studentCode: user.student?.studentId ?? null,
      studentProfileId: current.studentProfileId,
      teacherProfileId: current.teacherProfileId,
      hasPhoto: (user.student?.profilePhotoId ?? user.teacher?.profilePhotoId ?? null) !== null,
    };
  }

  /**
   * Class Master / Teacher editing their own sign-in details. Students never edit their profile:
   * the official record is maintained by the Class Master.
   */
  async updateOwnAccount(current: AuthenticatedUser, dto: UpdateUserDto): Promise<MeView> {
    if (current.role === Role.STUDENT) {
      throw new ForbiddenException('Student profile details are maintained by the Class Master.');
    }

    await this.users.manager.transaction(async (manager) => {
      const user = await this.findByIdOrFail(current.id, manager);

      const username = dto.username === undefined ? user.username : dto.username?.toLowerCase() ?? null;
      const email = dto.email === undefined ? user.email : dto.email?.toLowerCase() ?? null;

      if (!username && !email) {
        throw new BadRequestException('Keep at least a username or an email so you can sign in.');
      }

      await this.assertIdentifiersAvailable(manager, { username, email }, user.id);

      user.username = username;
      user.email = email;
      if (dto.fullName !== undefined) {
        user.fullName = normalizeFullName(dto.fullName);
      }
      await manager.getRepository(User).save(user);
    });

    return this.getMe(current);
  }

  toView(user: User): UserView {
    return {
      id: user.id,
      role: user.role,
      fullName: user.fullName,
      username: user.username,
      email: user.email,
      status: user.status,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
    };
  }
}
