import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FilesModule } from '../files/files.module';
import { SettingsModule } from '../settings/settings.module';
import { Subject } from '../subjects/subjects.entity';
import { Submission } from '../submissions/submissions.entity';
import { TeacherSubject } from '../teacher-subjects/teacher-subjects.entity';
import { AssignmentsController } from './assignments.controller';
import { Assignment, AssignmentAttachment } from './assignments.entity';
import { AssignmentsService } from './assignments.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Assignment, AssignmentAttachment, Subject, TeacherSubject, Submission]),
    FilesModule,
    SettingsModule,
  ],
  controllers: [AssignmentsController],
  providers: [AssignmentsService],
  exports: [AssignmentsService, TypeOrmModule],
})
export class AssignmentsModule {}
