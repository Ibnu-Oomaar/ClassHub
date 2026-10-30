import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { ExaminationStatus, ExaminationType } from '../types/examination.types.interface';

const toBoolean = ({ value }: { value: unknown }) => (value === undefined ? undefined : value === true || value === 'true');

export class ExaminationQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ExaminationStatus })
  @IsOptional()
  @IsEnum(ExaminationStatus)
  status?: ExaminationStatus;

  @ApiPropertyOptional({ enum: ExaminationType })
  @IsOptional()
  @IsEnum(ExaminationType)
  type?: ExaminationType;

  @ApiPropertyOptional({ description: 'Only examinations that include this subject' })
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @ApiPropertyOptional({ description: 'true = only examinations dated today or later' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  upcoming?: boolean;

  @ApiPropertyOptional({ description: 'true = results published, false = not yet published' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  resultsPublished?: boolean;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsISO8601({ strict: true })
  to?: string;
}
