import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator';
import { ReviewDecision } from '../types/mark.types.interface';

export class ReviewMarksDto {
  @ApiProperty({ enum: ReviewDecision })
  @IsEnum(ReviewDecision)
  decision: ReviewDecision;

  @ApiPropertyOptional({ description: 'Required when rejecting: tells the teacher what to correct' })
  @ValidateIf((dto: ReviewMarksDto) => dto.decision === ReviewDecision.REJECT || dto.feedback !== undefined)
  @Trim()
  @IsString()
  @IsNotEmpty({ message: 'Explain what the teacher must correct when rejecting marks.' })
  @MaxLength(1000)
  feedback?: string;
}
