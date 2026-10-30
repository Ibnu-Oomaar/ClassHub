import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignTeacherSubjectDto {
  @ApiProperty()
  @IsUUID()
  teacherId: string;

  @ApiProperty()
  @IsUUID()
  subjectId: string;
}
