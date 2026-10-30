import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { AccountStatus } from '../../common/enums/account-status.enum';
import { Gender } from '../../common/enums/gender.enum';

const toBoolean = ({ value }: { value: unknown }) => value === true || value === 'true';

export class StudentQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: AccountStatus })
  @IsOptional()
  @IsEnum(AccountStatus)
  status?: AccountStatus;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ description: 'Class Master only: also list removed (soft-deleted) students' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  includeDeleted?: boolean;

  @ApiPropertyOptional({ description: 'Class Master only: list only removed students (to restore them)' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  onlyDeleted?: boolean;
}
