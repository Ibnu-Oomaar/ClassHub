import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany, Relation } from 'typeorm';
import { AppBaseEntity } from '../database/base.entity';
import { numericTransformer } from '../common/utils/numeric.transformer';
import { FileRecord } from '../files/files.entity';
import { Subject } from '../subjects/subjects.entity';
import { Teacher } from '../teachers/teachers.entity';

/** Homework or classwork set by a teacher for one of their subjects. Visible to the whole class. */
@Entity('assignments')
export class Assignment extends AppBaseEntity {
  @Index()
  @Column({ type: 'uuid', name: 'subject_id' })
  subjectId: string;

  @ManyToOne(() => Subject, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'subject_id' })
  subject: Relation<Subject>;

  @Index()
  @Column({ type: 'uuid', name: 'teacher_id' })
  teacherId: string;

  @ManyToOne(() => Teacher, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'teacher_id' })
  teacher: Relation<Teacher>;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Index()
  @Column({ type: 'timestamptz', name: 'due_at' })
  dueAt: Date;

  @Column({ type: 'numeric', precision: 7, scale: 2, name: 'max_marks', transformer: numericTransformer })
  maxMarks: number;

  /** Students only see available assignments. The teacher and the Class Master can switch it off. */
  @Index()
  @Column({ type: 'boolean', name: 'is_available', default: true })
  isAvailable: boolean;

  @Column({ type: 'boolean', name: 'allow_late_submissions', default: false })
  allowLateSubmissions: boolean;

  @OneToMany(() => AssignmentAttachment, (attachment) => attachment.assignment)
  attachments: Relation<AssignmentAttachment[]>;
}

/** A file the teacher attached to an assignment (the bytes live in local storage, see `files`). */
@Entity('assignment_attachments')
export class AssignmentAttachment extends AppBaseEntity {
  @Index()
  @Column({ type: 'uuid', name: 'assignment_id' })
  assignmentId: string;

  @ManyToOne(() => Assignment, (assignment) => assignment.attachments, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'assignment_id' })
  assignment: Relation<Assignment>;

  @Column({ type: 'uuid', name: 'file_id', unique: true })
  fileId: string;

  @ManyToOne(() => FileRecord, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'file_id' })
  file: Relation<FileRecord>;
}
