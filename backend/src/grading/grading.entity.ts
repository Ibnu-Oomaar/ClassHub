import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, Relation, Unique } from 'typeorm';
import { AppBaseEntity } from '../database/base.entity';
import { numericTransformer } from '../common/utils/numeric.transformer';

/**
 * A configurable grading scale (for example A/B/C/D/F with mark ranges). The Class
 * Master builds it; the application ships with none. Only one scale can be active at a time,
 * which the partial unique index below enforces in the database itself.
 */
@Entity('grading_scales')
@Index('uq_grading_scales_single_active', ['isActive'], { unique: true, where: '"is_active" = true' })
export class GradingScale extends AppBaseEntity {
  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 100, name: 'name_key', unique: true })
  nameKey: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  @Column({ type: 'boolean', name: 'is_active', default: false })
  isActive: boolean;

  @Column({ type: 'numeric', precision: 10, scale: 2, name: 'max_mark', transformer: numericTransformer })
  maxMark: number;

  @OneToMany(() => GradeBand, (band) => band.scale)
  bands: Relation<GradeBand[]>;
}

/** One row of a scale: marks in the inclusive range earn `grade`. */
@Entity('grade_bands')
@Unique('uq_grade_band_grade', ['scaleId', 'grade'])
@Unique('uq_grade_band_min', ['scaleId', 'minMark'])
export class GradeBand extends AppBaseEntity {
  @Index()
  @Column({ type: 'uuid', name: 'scale_id' })
  scaleId: string;

  @ManyToOne(() => GradingScale, (scale) => scale.bands, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'scale_id' })
  scale: Relation<GradingScale>;

  @Column({ type: 'varchar', length: 10 })
  grade: string;

  @Column({ type: 'numeric', precision: 10, scale: 2, name: 'min_mark', transformer: numericTransformer })
  minMark: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, name: 'max_mark', transformer: numericTransformer })
  maxMark: number;

  @Column({ type: 'varchar', length: 60, nullable: true })
  remark: string | null;

  /** Whether this grade counts as a pass. Used for pass-rate statistics instead of a hardcoded mark. */
  @Column({ type: 'boolean', name: 'is_passing', default: true })
  isPassing: boolean;
}
