import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GradingController } from './grading.controller';
import { GradeBand, GradingScale } from './grading.entity';
import { GradingService } from './grading.service';

@Module({
  imports: [TypeOrmModule.forFeature([GradingScale, GradeBand])],
  controllers: [GradingController],
  providers: [GradingService],
  exports: [GradingService, TypeOrmModule],
})
export class GradingModule {}
