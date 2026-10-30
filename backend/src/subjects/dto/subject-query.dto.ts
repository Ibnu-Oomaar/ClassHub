import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';

const toBoolean = ({ value }: { value: unknown }) => (value === undefined ? undefined : value === true || value === 'true');

export class SubjectQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'true = active only, false = inactive only (Class Master)' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Only subjects taught by this teacher' })
  @IsOptional()
  @IsUUID()
  teacherId?: string;

  @ApiPropertyOptional({ description: 'true = only subjects without a teacher' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  unassignedOnly?: boolean;
}
