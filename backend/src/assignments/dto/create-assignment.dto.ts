import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Trim, TrimToNull } from '../../common/decorators/trim.decorator';
import { MAX_ASSIGNMENT_ATTACHMENTS } from '../types/assignment.types.interface';

export class CreateAssignmentDto {
  @ApiProperty({ description: 'One of the subjects assigned to you' })
  @IsUUID()
  subjectId: string;

  @ApiProperty({ example: 'Chapter 3 exercises' })
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({ nullable: true, description: 'Instructions for the students' })
  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(8000)
  description?: string | null;

  @ApiProperty({ example: '2026-11-05T15:00:00Z', description: 'Deadline (must be in the future when creating)' })
  @IsISO8601({ strict: true }, { message: 'The deadline must be a valid date and time.' })
  dueAt: string;

  @ApiProperty({ example: 20 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1, { message: 'Maximum marks must be at least 1.' })
  @Max(1000)
  maxMarks: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  allowLateSubmissions?: boolean;

  @ApiPropertyOptional({
    type: [String],
    description: 'Ids returned by POST /files/upload with category ASSIGNMENT_ATTACHMENT',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ASSIGNMENT_ATTACHMENTS)
  @IsUUID('all', { each: true })
  attachmentFileIds?: string[];
}
