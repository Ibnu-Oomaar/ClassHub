import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { TrimToNull } from '../../common/decorators/trim.decorator';

/** Provide a written answer, an uploaded file, or both. */
export class CreateSubmissionDto {
  @ApiProperty()
  @IsUUID()
  assignmentId: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(20000)
  textAnswer?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Id returned by POST /files/upload with category SUBMISSION' })
  @IsOptional()
  @IsUUID()
  fileId?: string | null;
}
