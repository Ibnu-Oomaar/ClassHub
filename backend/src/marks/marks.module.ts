import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExaminationSubject } from '../examinations/examinations.entity';
import { GradingModule } from '../grading/grading.module';
import { Student } from '../students/students.entity';
import { TeacherSubject } from '../teacher-subjects/teacher-subjects.entity';
import { MarksController } from './marks.controller';
import { Mark } from './marks.entity';
import { MarksService } from './marks.service';

@Module({
  imports: [TypeOrmModule.forFeature([Mark, ExaminationSubject, Student, TeacherSubject]), GradingModule],
  controllers: [MarksController],
  providers: [MarksService],
  exports: [MarksService, TypeOrmModule],
})
export class MarksModule {}
