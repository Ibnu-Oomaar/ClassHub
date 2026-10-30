import { Check, Column, Entity, Index, JoinColumn, ManyToOne, Relation, Unique } from 'typeorm';
import { AppBaseEntity } from '../database/base.entity';
import { numericTransformer } from '../common/utils/numeric.transformer';
import { ExaminationSubject } from '../examinations/examinations.entity';
import { Student } from '../students/students.entity';

/**
 * One student's mark in one subject of one examination. A row only exists once a teacher has
 * entered something for that student. Absent students have no score and `isAbsent = true`.
 */
@Entity('marks')
@Unique('uq_mark_student_per_exam_subject', ['examinationSubjectId', 'studentId'])
@Check('chk_marks_score_not_negative', '"score" IS NULL OR "score" >= 0')
@Check('chk_marks_absent_has_no_score', '"is_absent" = false OR "score" IS NULL')
export class Mark extends AppBaseEntity {
  @Index()
  @Column({ type: 'uuid', name: 'examination_subject_id' })
  examinationSubjectId: string;

  @ManyToOne(() => ExaminationSubject, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'examination_subject_id' })
  examinationSubject: Relation<ExaminationSubject>;

  @Index()
  @Column({ type: 'uuid', name: 'student_id' })
  studentId: string;

  @ManyToOne(() => Student, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'student_id' })
  student: Relation<Student>;

  /** Null while the student is marked absent. Never exceeds the subject's maximum (validated in the service). */
  @Column({ type: 'numeric', precision: 7, scale: 2, nullable: true, transformer: numericTransformer })
  score: number | null;

  @Column({ type: 'boolean', name: 'is_absent', default: false })
  isAbsent: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  remarks: string | null;

  /** Grade frozen at publication time, so later changes to the grading scale never alter published results. */
  @Column({ type: 'varchar', length: 10, nullable: true })
  grade: string | null;

  @Column({ type: 'uuid', name: 'entered_by_id', nullable: true })
  enteredById: string | null;
}
