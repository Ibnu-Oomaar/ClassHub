import { Check, Column, Entity, Index, JoinColumn, ManyToOne, Relation, Unique } from 'typeorm';
import { Assignment } from '../assignments/assignments.entity';
import { AppBaseEntity } from '../database/base.entity';
import { numericTransformer } from '../common/utils/numeric.transformer';
import { FileRecord } from '../files/files.entity';
import { Student } from '../students/students.entity';

/** A student's work for an assignment. One per student per assignment; it can be edited until it is graded. */
@Entity('submissions')
@Unique('uq_submission_per_student_per_assignment', ['assignmentId', 'studentId'])
@Check('chk_submissions_has_content', '"text_answer" IS NOT NULL OR "file_id" IS NOT NULL')
@Check('chk_submissions_score_not_negative', '"score" IS NULL OR "score" >= 0')
export class Submission extends AppBaseEntity {
  @Index()
  @Column({ type: 'uuid', name: 'assignment_id' })
  assignmentId: string;

  @ManyToOne(() => Assignment, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assignment_id' })
  assignment: Relation<Assignment>;

  @Index()
  @Column({ type: 'uuid', name: 'student_id' })
  studentId: string;

  @ManyToOne(() => Student, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'student_id' })
  student: Relation<Student>;

  @Column({ type: 'text', name: 'text_answer', nullable: true })
  textAnswer: string | null;

  @Column({ type: 'uuid', name: 'file_id', nullable: true })
  fileId: string | null;

  @ManyToOne(() => FileRecord, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'file_id' })
  file?: Relation<FileRecord> | null;

  @Column({ type: 'timestamptz', name: 'submitted_at' })
  submittedAt: Date;

  @Column({ type: 'boolean', name: 'is_late', default: false })
  isLate: boolean;

  @Column({ type: 'numeric', precision: 7, scale: 2, nullable: true, transformer: numericTransformer })
  score: number | null;

  @Column({ type: 'text', nullable: true })
  feedback: string | null;

  @Column({ type: 'timestamptz', name: 'graded_at', nullable: true })
  gradedAt: Date | null;

  /** users.id of the teacher who graded it. */
  @Column({ type: 'uuid', name: 'graded_by_id', nullable: true })
  gradedById: string | null;

  /** The student only sees the score and feedback once the teacher has released them. */
  @Column({ type: 'boolean', name: 'is_released', default: false })
  isReleased: boolean;
}
