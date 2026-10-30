import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { TrimToNull } from '../../common/decorators/trim.decorator';

export class UpdateSettingsDto {
  @ApiPropertyOptional({ example: '2026/2027', nullable: true })
  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(40)
  academicYear?: string | null;

  @ApiPropertyOptional({ example: 'Term 1', nullable: true })
  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(60)
  currentPeriod?: string | null;

  @ApiPropertyOptional({ description: 'When off, students cannot submit assignments' })
  @IsOptional()
  @IsBoolean()
  studentSubmissionsEnabled?: boolean;
}
