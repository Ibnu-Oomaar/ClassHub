import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Assignment } from '../assignments/assignments.entity';
import { FilesModule } from '../files/files.module';
import { SettingsModule } from '../settings/settings.module';
import { Student } from '../students/students.entity';
import { TeacherSubject } from '../teacher-subjects/teacher-subjects.entity';
import { SubmissionsController } from './submissions.controller';
import { Submission } from './submissions.entity';
import { SubmissionsService } from './submissions.service';

@Module({
  imports: [TypeOrmModule.forFeature([Submission, Assignment, Student, TeacherSubject]), FilesModule, SettingsModule],
  controllers: [SubmissionsController],
  providers: [SubmissionsService],
  exports: [SubmissionsService, TypeOrmModule],
})
export class SubmissionsModule {}
