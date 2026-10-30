import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/types/audit-log.types.interface';
import { PaginationQueryDto } from '../common/pagination/pagination-query.dto';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { nameKey, normalizeFullName } from '../common/utils/name.util';
import { Paginated, buildPaginated, skipFor } from '../common/pagination/pagination.util';
import { escapeLike } from '../common/utils/sort.util';
import { GradeBandDto, CreateGradingScaleDto } from './dto/create-grading-scale.dto';
import { UpdateGradingScaleDto } from './dto/update-grading-scale.dto';
import { resolveBand } from './grade-resolver';
import { GradeBand, GradingScale } from './grading.entity';
import { GradeBandView, GradeResult, GradingScaleView } from './types/grading.types.interface';

@Injectable()
export class GradingService {
  constructor(
    @InjectRepository(GradingScale) private readonly scales: Repository<GradingScale>,
    @InjectRepository(GradeBand) private readonly bands: Repository<GradeBand>,
    private readonly audit: AuditLogsService,
  ) {}

  async create(dto: CreateGradingScaleDto, actor: AuthenticatedUser): Promise<GradingScaleView> {
    this.assertValidBands(dto.bands, dto.maxMark);
    const name = normalizeFullName(dto.name);
    await this.assertNameFree(name);

    const id = await this.scales.manager.transaction(async (manager) => {
      const scale = await manager.getRepository(GradingScale).save(
        manager.getRepository(GradingScale).create({
          name,
          nameKey: nameKey(name),
          description: dto.description ?? null,
          maxMark: dto.maxMark,
          isActive: false,
        }),
      );
      await this.insertBands(manager, scale.id, dto.bands);
      if (dto.activate) {
        await this.activateInTransaction(manager, scale.id);
      }
      return scale.id;
    });

    await this.audit.record({
      actor,
      action: AuditAction.GRADING_SCALE_CREATED,
      entityType: 'GradingScale',
      entityId: id,
      summary: `Created grading scale ${name}${dto.activate ? ' and made it active' : ''}`,
      details: { bands: dto.bands.length },
    });

    return this.findOne(id);
  }

  async list(query: PaginationQueryDto): Promise<Paginated<GradingScaleView>> {
    const qb = this.scales.createQueryBuilder('scale');
    if (query.search) {
      qb.where(`scale.name ILIKE :search ESCAPE '\\'`, { search: `%${escapeLike(query.search)}%` });
    }
    qb.orderBy('scale.isActive', 'DESC')
      .addOrderBy('scale.name', 'ASC')
      .addOrderBy('scale.id', 'ASC')
      .skip(skipFor(query.page, query.limit))
      .take(query.limit);

    const [rows, total] = await qb.getManyAndCount();
    const views = await this.toViews(rows);
    return buildPaginated(views, total, query.page, query.limit);
  }

  async findOne(id: string): Promise<GradingScaleView> {
    const scale = await this.scales.findOne({ where: { id } });
    if (!scale) {
      throw new NotFoundException('Grading scale not found.');
    }
    return (await this.toViews([scale]))[0];
  }

  /** The active scale, or null when the Class Master has not configured one yet. */
  async getActive(): Promise<GradingScaleView | null> {
    const scale = await this.scales.findOne({ where: { isActive: true } });
    return scale ? (await this.toViews([scale]))[0] : null;
  }

  async update(id: string, dto: UpdateGradingScaleDto, actor: AuthenticatedUser): Promise<GradingScaleView> {
    const scale = await this.scales.findOne({ where: { id } });
    if (!scale) {
      throw new NotFoundException('Grading scale not found.');
    }
    if (dto.bands) {
      this.assertValidBands(dto.bands, dto.maxMark ?? scale.maxMark);
    } else if (dto.maxMark !== undefined) {
      const currentBands = await this.bands.find({ where: { scaleId: id } });
      this.assertValidBandMaximum(currentBands, dto.maxMark);
    }

    await this.scales.manager.transaction(async (manager) => {
      if (dto.name !== undefined) {
        const name = normalizeFullName(dto.name);
        await this.assertNameFree(name, id);
        scale.name = name;
        scale.nameKey = nameKey(name);
      }
      if (dto.description !== undefined) scale.description = dto.description ?? null;
      if (dto.maxMark !== undefined) scale.maxMark = dto.maxMark;
      await manager.getRepository(GradingScale).save(scale);

      if (dto.bands) {
        // Delete first, then insert, so the unique (scale, grade) / (scale, min) rules never clash mid-way.
        await manager.getRepository(GradeBand).delete({ scaleId: id });
        await this.insertBands(manager, id, dto.bands);
      }
    });

    await this.audit.record({
      actor,
      action: AuditAction.GRADING_SCALE_UPDATED,
      entityType: 'GradingScale',
      entityId: id,
      summary: `Updated grading scale ${scale.name}`,
      details: { fields: Object.keys(dto) },
    });

    return this.findOne(id);
  }

  async activate(id: string, actor: AuthenticatedUser): Promise<GradingScaleView> {
    const scale = await this.scales.findOne({ where: { id } });
    if (!scale) {
      throw new NotFoundException('Grading scale not found.');
    }
    await this.scales.manager.transaction((manager) => this.activateInTransaction(manager, id));

    await this.audit.record({
      actor,
      action: AuditAction.GRADING_SCALE_ACTIVATED,
      entityType: 'GradingScale',
      entityId: id,
      summary: `Activated grading scale ${scale.name}. Results already published keep the grades they were published with.`,
    });

    return this.findOne(id);
  }

  async remove(id: string, actor: AuthenticatedUser): Promise<{ deleted: true }> {
    const scale = await this.scales.findOne({ where: { id } });
    if (!scale) {
      throw new NotFoundException('Grading scale not found.');
    }
    if (scale.isActive) {
      throw new ConflictException('This is the active scale. Activate another scale before deleting it.');
    }
    await this.scales.delete({ id });

    await this.audit.record({
      actor,
      action: AuditAction.GRADING_SCALE_DELETED,
      entityType: 'GradingScale',
      entityId: id,
      summary: `Deleted grading scale ${scale.name}`,
    });
    return { deleted: true };
  }

  // ---------------------------------------------------------------------------------------------
  // Used by the marks and results features.

  /** Bands of the active scale (empty array when none is active). */
  async loadActiveBands(manager?: EntityManager): Promise<GradeBand[]> {
    const repository = manager ? manager.getRepository(GradeBand) : this.bands;
    return repository
      .createQueryBuilder('band')
      .innerJoin('band.scale', 'scale', 'scale.isActive = true')
      .orderBy('band.minMark', 'DESC')
      .getMany();
  }

  /** Active grading scale, or null when the Class Master has not activated one. */
  async loadActiveScale(manager?: EntityManager): Promise<{ maxMark: number; bands: GradeBand[] } | null> {
    const scaleRepository = manager ? manager.getRepository(GradingScale) : this.scales;
    const scale = await scaleRepository.findOne({ where: { isActive: true } });
    if (!scale) return null;

    const bandRepository = manager ? manager.getRepository(GradeBand) : this.bands;
    const bands = await bandRepository.find({ where: { scaleId: scale.id }, order: { minMark: 'DESC' } });
    return { maxMark: scale.maxMark, bands };
  }

  /** Grades an actual mark against the configured ranges. No bands = no grade, never an invented one. */
  gradeWith(mark: number, bands: readonly GradeBand[]): GradeResult {
    const band = resolveBand(mark, bands);
    return band
      ? { grade: band.grade, remark: band.remark, isPassing: band.isPassing }
      : { grade: null, remark: null, isPassing: null };
  }

  /** Applies a mark scale to aggregate results expressed as percentages. */
  gradeAtPercentage(percentage: number, maxMark: number, bands: readonly GradeBand[]): GradeResult {
    const mark = Math.round(((percentage * maxMark) / 100) * 100) / 100;
    return this.gradeWith(mark, bands);
  }

  async gradeFor(mark: number, manager?: EntityManager): Promise<GradeResult> {
    return this.gradeWith(mark, await this.loadActiveBands(manager));
  }

  // ---------------------------------------------------------------------------------------------

  private async activateInTransaction(manager: EntityManager, id: string): Promise<void> {
    const repository = manager.getRepository(GradingScale);
    const bandCount = await manager.getRepository(GradeBand).count({ where: { scaleId: id } });
    if (bandCount === 0) {
      throw new BadRequestException('A scale needs at least one band before it can be activated.');
    }
    await repository.update({ isActive: true }, { isActive: false });
    await repository.update({ id }, { isActive: true });
  }

  private async insertBands(manager: EntityManager, scaleId: string, bands: GradeBandDto[]): Promise<void> {
    const repository = manager.getRepository(GradeBand);
    await repository.save(
      bands.map((band) =>
        repository.create({
          scaleId,
          grade: band.grade,
          minMark: band.minMark,
          maxMark: band.maxMark,
          remark: band.remark ?? null,
          isPassing: band.isPassing ?? true,
        }),
      ),
    );
  }

  private assertValidBands(bands: GradeBandDto[], maxMark: number): void {
    if (!bands.some((band) => band.minMark === 0)) {
      throw new BadRequestException('One band must start at 0 marks, otherwise low scores would have no grade.');
    }
    const grades = new Set<string>();
    for (const band of bands) {
      if (band.minMark > band.maxMark) {
        throw new BadRequestException(`The minimum mark for grade "${band.grade}" cannot exceed its maximum mark.`);
      }
      if (band.maxMark > maxMark) {
        throw new BadRequestException(`The maximum mark for grade "${band.grade}" cannot exceed the scale maximum of ${maxMark}.`);
      }
      const key = band.grade.toLocaleLowerCase('en');
      if (grades.has(key)) {
        throw new BadRequestException(`The grade "${band.grade}" appears more than once.`);
      }
      grades.add(key);
    }

    const ordered = [...bands].sort((a, b) => a.minMark - b.minMark);
    for (let index = 1; index < ordered.length; index++) {
      const previous = ordered[index - 1];
      const current = ordered[index];
      if (current.minMark <= previous.maxMark) {
        throw new BadRequestException(`The ranges for grades "${previous.grade}" and "${current.grade}" overlap.`);
      }
    }
  }

  private assertValidBandMaximum(bands: GradeBand[], maxMark: number): void {
    const exceedingBand = bands.find((band) => band.maxMark > maxMark);
    if (exceedingBand) {
      throw new BadRequestException(`The maximum mark for grade "${exceedingBand.grade}" exceeds the scale maximum of ${maxMark}.`);
    }
  }

  private async assertNameFree(name: string, excludeId?: string): Promise<void> {
    const qb = this.scales.createQueryBuilder('scale').where('scale.nameKey = :key', { key: nameKey(name) });
    if (excludeId) qb.andWhere('scale.id <> :excludeId', { excludeId });
    if (await qb.getExists()) {
      throw new ConflictException('A grading scale with this name already exists.');
    }
  }

  private async toViews(scales: GradingScale[]): Promise<GradingScaleView[]> {
    if (scales.length === 0) return [];
    const rows = await this.bands
      .createQueryBuilder('band')
      .where('band.scaleId IN (:...ids)', { ids: scales.map((scale) => scale.id) })
      .orderBy('band.minMark', 'DESC')
      .getMany();

    const byScale = new Map<string, GradeBandView[]>();
    for (const row of rows) {
      const list = byScale.get(row.scaleId) ?? [];
      list.push({ id: row.id, grade: row.grade, minMark: row.minMark, maxMark: row.maxMark, remark: row.remark, isPassing: row.isPassing });
      byScale.set(row.scaleId, list);
    }

    return scales.map((scale) => ({
      id: scale.id,
      name: scale.name,
      description: scale.description,
      maxMark: scale.maxMark,
      isActive: scale.isActive,
      bands: byScale.get(scale.id) ?? [],
      createdAt: scale.createdAt,
      updatedAt: scale.updatedAt,
    }));
  }
}
