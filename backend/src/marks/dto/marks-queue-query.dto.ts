import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { MarksStatus } from '../../examinations/types/examination.types.interface';

export class MarksQueueQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: MarksStatus, description: 'Defaults to SUBMITTED (waiting for the Class Master)' })
  @IsOptional()
  @IsEnum(MarksStatus)
  status?: MarksStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  examinationId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  subjectId?: string;
}
