import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Mark } from '../marks/marks.entity';
import { SettingsModule } from '../settings/settings.module';
import { Subject } from '../subjects/subjects.entity';
import { TeacherSubject } from '../teacher-subjects/teacher-subjects.entity';
import { ExaminationsController } from './examinations.controller';
import { Examination, ExaminationSubject } from './examinations.entity';
import { ExaminationsService } from './examinations.service';

@Module({
  imports: [TypeOrmModule.forFeature([Examination, ExaminationSubject, Subject, TeacherSubject, Mark]), SettingsModule],
  controllers: [ExaminationsController],
  providers: [ExaminationsService],
  exports: [ExaminationsService, TypeOrmModule],
})
export class ExaminationsModule {}
