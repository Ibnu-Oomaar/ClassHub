import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Assignment } from '../assignments/assignments.entity';
import { Examination } from '../examinations/examinations.entity';
import { FilesModule } from '../files/files.module';
import { GradingModule } from '../grading/grading.module';
import { Mark } from '../marks/marks.entity';
import { Result } from '../results/results.entity';
import { ResultsModule } from '../results/results.module';
import { SettingsModule } from '../settings/settings.module';
import { Student } from '../students/students.entity';
import { Subject } from '../subjects/subjects.entity';
import { Submission } from '../submissions/submissions.entity';
import { SubmissionsModule } from '../submissions/submissions.module';
import { TeacherSubject } from '../teacher-subjects/teacher-subjects.entity';
import { ReportDataService } from './report-data.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Result, Examination, Mark, Student, Subject, TeacherSubject, Assignment, Submission]),
    ResultsModule,
    SubmissionsModule,
    GradingModule,
    SettingsModule,
    FilesModule,
  ],
  controllers: [ReportsController],
  providers: [ReportDataService, ReportsService],
})
export class ReportsModule {}
