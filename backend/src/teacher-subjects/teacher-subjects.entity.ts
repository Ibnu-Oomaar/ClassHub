import { Column, Entity, Index, JoinColumn, ManyToOne, Relation, Unique } from 'typeorm';
import { AppBaseEntity } from '../database/base.entity';
import { Subject } from '../subjects/subjects.entity';
import { Teacher } from '../teachers/teachers.entity';

/**
 * Which teacher teaches which subject. This is the single source of truth for what a teacher may
 * see and do: every teacher-facing query is scoped through these rows.
 */
@Entity('teacher_subjects')
@Unique('uq_teacher_subject', ['teacherId', 'subjectId'])
export class TeacherSubject extends AppBaseEntity {
  @Index()
  @Column({ type: 'uuid', name: 'teacher_id' })
  teacherId: string;

  @ManyToOne(() => Teacher, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'teacher_id' })
  teacher: Relation<Teacher>;

  @Index()
  @Column({ type: 'uuid', name: 'subject_id' })
  subjectId: string;

  @ManyToOne(() => Subject, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'subject_id' })
  subject: Relation<Subject>;

  @Column({ type: 'uuid', name: 'assigned_by_id', nullable: true })
  assignedById: string | null;
}
