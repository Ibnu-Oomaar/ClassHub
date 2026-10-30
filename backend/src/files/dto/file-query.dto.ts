import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { FileCategory } from '../types/file.types.interface';

export class FileQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: FileCategory })
  @IsOptional()
  @IsEnum(FileCategory)
  category?: FileCategory;

  @ApiPropertyOptional({ description: 'Only files not linked to any record (candidates for clean-up)' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  unattachedOnly?: boolean;
}
