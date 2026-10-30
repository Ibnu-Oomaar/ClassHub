import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';

const toBoolean = ({ value }: { value: unknown }) => (value === undefined ? undefined : value === true || value === 'true');

export enum SubmissionStatusFilter {
  SUBMITTED = 'SUBMITTED',
  GRADED = 'GRADED',
}

export class SubmissionQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignmentId?: string;

  @ApiPropertyOptional({ description: 'Staff only' })
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @ApiPropertyOptional({ description: 'Staff only' })
  @IsOptional()
  @IsUUID()
  studentId?: string;

  @ApiPropertyOptional({ enum: SubmissionStatusFilter, description: 'SUBMITTED = waiting to be graded' })
  @IsOptional()
  @IsEnum(SubmissionStatusFilter)
  status?: SubmissionStatusFilter;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isLate?: boolean;
}
