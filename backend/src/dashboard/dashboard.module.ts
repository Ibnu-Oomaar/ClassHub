import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnnouncementsModule } from '../announcements/announcements.module';
import { Assignment } from '../assignments/assignments.entity';
import { Backup } from '../backups/backups.entity';
import { Examination, ExaminationSubject } from '../examinations/examinations.entity';
import { Result } from '../results/results.entity';
import { ResultsModule } from '../results/results.module';
import { SettingsModule } from '../settings/settings.module';
import { Student } from '../students/students.entity';
import { Subject } from '../subjects/subjects.entity';
import { Submission } from '../submissions/submissions.entity';
import { TeacherSubject } from '../teacher-subjects/teacher-subjects.entity';
import { Teacher } from '../teachers/teachers.entity';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Student, Teacher, Subject, TeacherSubject, Assignment, Submission, Examination, ExaminationSubject, Result, Backup]),
    AnnouncementsModule,
    ResultsModule,
    SettingsModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
