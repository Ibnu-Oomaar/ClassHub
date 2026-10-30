import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { AuditAction } from '../types/audit-log.types.interface';

export class AuditLogQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: AuditAction })
  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  @ApiPropertyOptional({ description: 'e.g. Student, Teacher, Examination' })
  @IsOptional()
  entityType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  actorId?: string;

  @ApiPropertyOptional({ description: 'ISO date, inclusive' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO date, inclusive' })
  @IsOptional()
  @IsDateString()
  to?: string;
}
