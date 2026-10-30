import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { TrimToNull } from '../../common/decorators/trim.decorator';

/** Change your answer before it is graded. Send `null` to remove the text or the file; one of them must remain. */
export class UpdateSubmissionDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(20000)
  textAnswer?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  fileId?: string | null;
}
