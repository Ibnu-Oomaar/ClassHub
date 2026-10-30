import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, Relation, Unique } from 'typeorm';
import { AppBaseEntity } from '../database/base.entity';
import { numericTransformer } from '../common/utils/numeric.transformer';
import { Subject } from '../subjects/subjects.entity';
import { ExaminationStatus, ExaminationType, MarksStatus } from './types/examination.types.interface';

@Entity('examinations')
export class Examination extends AppBaseEntity {
  @Column({ type: 'varchar', length: 150 })
  name: string;

  @Column({ type: 'enum', enum: ExaminationType, enumName: 'examination_type' })
  type: ExaminationType;

  @Index()
  @Column({ type: 'date', name: 'exam_date' })
  examDate: string;

  @Column({ type: 'varchar', length: 60, name: 'academic_period', nullable: true })
  academicPeriod: string | null;

  @Column({ type: 'text', nullable: true })
  instructions: string | null;

  @Index()
  @Column({ type: 'enum', enum: ExaminationStatus, enumName: 'examination_status', default: ExaminationStatus.SCHEDULED })
  status: ExaminationStatus;

  /** Set when the Class Master publishes results. Students only see results while this is set. */
  @Column({ type: 'timestamptz', name: 'results_published_at', nullable: true })
  resultsPublishedAt: Date | null;

  @Column({ type: 'uuid', name: 'results_published_by_id', nullable: true })
  resultsPublishedById: string | null;

  @Column({ type: 'uuid', name: 'created_by_id', nullable: true })
  createdById: string | null;

  @OneToMany(() => ExaminationSubject, (examinationSubject) => examinationSubject.examination)
  subjects: Relation<ExaminationSubject[]>;
}

/**
 * One subject inside one examination. It carries the maximum marks and the state of the marks
 * workflow (see MarksStatus), so approval happens per subject.
 */
@Entity('examination_subjects')
@Unique('uq_examination_subject', ['examinationId', 'subjectId'])
export class ExaminationSubject extends AppBaseEntity {
  @Index()
  @Column({ type: 'uuid', name: 'examination_id' })
  examinationId: string;

  @ManyToOne(() => Examination, (examination) => examination.subjects, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'examination_id' })
  examination: Relation<Examination>;

  @Index()
  @Column({ type: 'uuid', name: 'subject_id' })
  subjectId: string;

  @ManyToOne(() => Subject, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'subject_id' })
  subject: Relation<Subject>;

  @Column({ type: 'numeric', precision: 7, scale: 2, name: 'max_marks', transformer: numericTransformer })
  maxMarks: number;

  @Index()
  @Column({ type: 'enum', enum: MarksStatus, enumName: 'marks_status', name: 'marks_status', default: MarksStatus.PENDING })
  marksStatus: MarksStatus;

  @Column({ type: 'timestamptz', name: 'submitted_at', nullable: true })
  submittedAt: Date | null;

  @Column({ type: 'uuid', name: 'submitted_by_id', nullable: true })
  submittedById: string | null;

  @Column({ type: 'timestamptz', name: 'reviewed_at', nullable: true })
  reviewedAt: Date | null;

  @Column({ type: 'uuid', name: 'reviewed_by_id', nullable: true })
  reviewedById: string | null;

  /** Why the Class Master rejected the marks. Shown to the teacher. */
  @Column({ type: 'text', name: 'review_feedback', nullable: true })
  reviewFeedback: string | null;
}
