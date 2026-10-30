import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { AnnouncementAudience } from '../types/announcement.types.interface';

const toBoolean = ({ value }: { value: unknown }) => (value === undefined ? undefined : value === true || value === 'true');

export enum AnnouncementStateFilter {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
}

export class AnnouncementQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: AnnouncementAudience })
  @IsOptional()
  @IsEnum(AnnouncementAudience)
  audience?: AnnouncementAudience;

  @ApiPropertyOptional({ enum: AnnouncementStateFilter, description: 'Class Master only. Teachers and students always get ACTIVE.' })
  @IsOptional()
  @IsEnum(AnnouncementStateFilter)
  state?: AnnouncementStateFilter;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isPinned?: boolean;
}
