import { Column, Entity, Index, JoinColumn, ManyToOne, Relation, Unique } from 'typeorm';
import { AppBaseEntity } from '../database/base.entity';
import { numericTransformer } from '../common/utils/numeric.transformer';
import { Examination } from '../examinations/examinations.entity';
import { Student } from '../students/students.entity';

/**
 * A student's published overall result for one examination. Rows only exist while the results
 * are published: publishing writes them (freezing totals, grade and rank) and unpublishing
 * removes them. Students can only ever read their own row.
 */
@Entity('results')
@Unique('uq_result_per_student_per_examination', ['examinationId', 'studentId'])
export class Result extends AppBaseEntity {
  @Index()
  @Column({ type: 'uuid', name: 'examination_id' })
  examinationId: string;

  @ManyToOne(() => Examination, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'examination_id' })
  examination: Relation<Examination>;

  @Index()
  @Column({ type: 'uuid', name: 'student_id' })
  studentId: string;

  @ManyToOne(() => Student, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'student_id' })
  student: Relation<Student>;

  @Column({ type: 'numeric', precision: 9, scale: 2, name: 'total_score', transformer: numericTransformer })
  totalScore: number;

  @Column({ type: 'numeric', precision: 9, scale: 2, name: 'total_max', transformer: numericTransformer })
  totalMax: number;

  @Column({ type: 'numeric', precision: 5, scale: 2, transformer: numericTransformer })
  percentage: number;

  /** Overall grade from the scale that was active at publication. */
  @Column({ type: 'varchar', length: 10, nullable: true })
  grade: string | null;

  @Column({ type: 'varchar', length: 60, name: 'grade_remark', nullable: true })
  gradeRemark: string | null;

  @Column({ type: 'boolean', name: 'is_passing', nullable: true })
  isPassing: boolean | null;

  @Column({ type: 'int' })
  rank: number;

  @Column({ type: 'int', name: 'subjects_count' })
  subjectsCount: number;

  @Column({ type: 'timestamptz', name: 'published_at' })
  publishedAt: Date;
}
