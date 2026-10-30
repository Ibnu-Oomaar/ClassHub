import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TeacherSubject } from '../teacher-subjects/teacher-subjects.entity';
import { SubjectsController } from './subjects.controller';
import { Subject } from './subjects.entity';
import { SubjectsService } from './subjects.service';

@Module({
  imports: [TypeOrmModule.forFeature([Subject, TeacherSubject])],
  controllers: [SubjectsController],
  providers: [SubjectsService],
  exports: [SubjectsService, TypeOrmModule],
})
export class SubjectsModule {}
