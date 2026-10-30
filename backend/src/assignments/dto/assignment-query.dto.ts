import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsISO8601, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';

const toBoolean = ({ value }: { value: unknown }) => (value === undefined ? undefined : value === true || value === 'true');

export enum AssignmentTimeFilter {
  OPEN = 'OPEN',
  CLOSED = 'CLOSED',
}

export class AssignmentQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @ApiPropertyOptional({ description: 'Class Master only: assignments of one teacher' })
  @IsOptional()
  @IsUUID()
  teacherId?: string;

  @ApiPropertyOptional({ description: 'Staff only: filter by availability' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isAvailable?: boolean;

  @ApiPropertyOptional({ enum: AssignmentTimeFilter, description: 'OPEN = deadline not reached, CLOSED = deadline passed' })
  @IsOptional()
  @IsEnum(AssignmentTimeFilter)
  time?: AssignmentTimeFilter;

  @ApiPropertyOptional({ description: 'Staff only: only assignments with submissions still waiting to be graded' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  pendingGrading?: boolean;

  @ApiPropertyOptional({ description: 'Student only: only assignments I have not submitted yet' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  notSubmitted?: boolean;

  @ApiPropertyOptional({ example: '2026-01-01T00:00:00Z' })
  @IsOptional()
  @IsISO8601({ strict: true })
  dueFrom?: string;

  @ApiPropertyOptional({ example: '2026-12-31T23:59:59Z' })
  @IsOptional()
  @IsISO8601({ strict: true })
  dueTo?: string;
}
