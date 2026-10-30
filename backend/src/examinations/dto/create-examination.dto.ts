import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Trim, TrimToNull } from '../../common/decorators/trim.decorator';
import { ExaminationStatus, ExaminationType } from '../types/examination.types.interface';

export class ExaminationSubjectInputDto {
  @ApiProperty()
  @IsUUID()
  subjectId: string;

  @ApiProperty({ example: 100, description: 'Maximum marks for this subject in this examination' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1, { message: 'Maximum marks must be at least 1.' })
  @Max(1000)
  maxMarks: number;
}

export class CreateExaminationDto {
  @ApiProperty({ example: 'Term 1 Midterm' })
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  name: string;

  @ApiProperty({ enum: ExaminationType })
  @IsEnum(ExaminationType)
  type: ExaminationType;

  @ApiProperty({ example: '2026-11-10' })
  @IsISO8601({ strict: true }, { message: 'Examination date must be a valid date (YYYY-MM-DD).' })
  examDate: string;

  @ApiPropertyOptional({ example: 'Term 1 2026', nullable: true, description: 'Defaults to the current period in Settings' })
  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(60)
  academicPeriod?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(4000)
  instructions?: string | null;

  @ApiPropertyOptional({ enum: ExaminationStatus, default: ExaminationStatus.SCHEDULED })
  @IsOptional()
  @IsEnum(ExaminationStatus)
  status?: ExaminationStatus;

  @ApiProperty({ type: [ExaminationSubjectInputDto] })
  @IsArray()
  @ArrayMinSize(1, { message: 'Select at least one subject.' })
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ExaminationSubjectInputDto)
  subjects: ExaminationSubjectInputDto[];
}
