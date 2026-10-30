import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { AccountStatus } from '../../common/enums/account-status.enum';

const toBoolean = ({ value }: { value: unknown }) => value === true || value === 'true';

export class TeacherQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: AccountStatus })
  @IsOptional()
  @IsEnum(AccountStatus)
  status?: AccountStatus;

  @ApiPropertyOptional({ description: 'Only teachers assigned to this subject' })
  @IsOptional()
  @IsUUID()
  subjectId?: string;

  @ApiPropertyOptional({ description: 'Only teachers with no subject assigned yet' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  unassignedOnly?: boolean;

  @ApiPropertyOptional({ description: 'Also list removed (soft-deleted) teachers' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeDeleted?: boolean;

  @ApiPropertyOptional({ description: 'List only removed teachers (to restore them)' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  onlyDeleted?: boolean;
}
