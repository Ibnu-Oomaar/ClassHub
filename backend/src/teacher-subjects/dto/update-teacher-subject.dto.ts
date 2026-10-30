import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

/** Moves an existing assignment to another teacher or subject. */
export class UpdateTeacherSubjectDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  teacherId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  subjectId?: string;
}
