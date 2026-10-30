import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Examination, ExaminationSubject } from '../examinations/examinations.entity';
import { GradingModule } from '../grading/grading.module';
import { Mark } from '../marks/marks.entity';
import { ResultsController } from './results.controller';
import { Result } from './results.entity';
import { ResultsService } from './results.service';

@Module({
  imports: [TypeOrmModule.forFeature([Result, Examination, ExaminationSubject, Mark]), GradingModule],
  controllers: [ResultsController],
  providers: [ResultsService],
  exports: [ResultsService, TypeOrmModule],
})
export class ResultsModule {}
