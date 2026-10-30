import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Subject } from '../subjects/subjects.entity';
import { Teacher } from '../teachers/teachers.entity';
import { TeacherSubjectsController } from './teacher-subjects.controller';
import { TeacherSubject } from './teacher-subjects.entity';
import { TeacherSubjectsService } from './teacher-subjects.service';

@Module({
  imports: [TypeOrmModule.forFeature([TeacherSubject, Teacher, Subject])],
  controllers: [TeacherSubjectsController],
  providers: [TeacherSubjectsService],
  exports: [TeacherSubjectsService, TypeOrmModule],
})
export class TeacherSubjectsModule {}
