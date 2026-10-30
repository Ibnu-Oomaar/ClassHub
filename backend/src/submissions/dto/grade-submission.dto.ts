import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { TrimToNull } from '../../common/decorators/trim.decorator';

export class GradeSubmissionDto {
  @ApiProperty({ example: 17.5, description: 'Between 0 and the assignment maximum' })
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'A score can have at most 2 decimal places.' })
  @Min(0, { message: 'A score cannot be negative.' })
  score: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(4000)
  feedback?: string | null;

  @ApiPropertyOptional({ default: true, description: 'false keeps the grade hidden from the student for now' })
  @IsOptional()
  @IsBoolean()
  release?: boolean;
}
