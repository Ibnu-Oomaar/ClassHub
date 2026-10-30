import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';
import { TrimToNull } from '../../common/decorators/trim.decorator';

/** One student's entry. Shared by the single-mark and the whole-sheet endpoints. */
export class MarkEntryDto {
  @ApiProperty()
  @IsUUID()
  studentId: string;

  @ApiPropertyOptional({ example: 72.5, nullable: true, description: 'Leave empty (with isAbsent false) to clear the entry' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'A score can have at most 2 decimal places.' })
  @Min(0, { message: 'A score cannot be negative.' })
  score?: number | null;

  @ApiPropertyOptional({ default: false, description: 'Absent students have no score and count as 0 in totals' })
  @IsOptional()
  @IsBoolean()
  isAbsent?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(255)
  remarks?: string | null;
}

export class CreateMarkDto extends MarkEntryDto {
  @ApiProperty({ description: 'examination_subjects.id from the examination view' })
  @IsUUID()
  examinationSubjectId: string;
}
