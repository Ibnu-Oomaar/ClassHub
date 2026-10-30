import { ApiProperty } from '@nestjs/swagger';
import { Equals } from 'class-validator';

/** Submitting locks the marks until the Class Master reviews them, so it needs an explicit confirmation. */
export class SubmitMarksDto {
  @ApiProperty({ example: true, description: 'Must be true: confirms the marks are complete and ready for review' })
  @Equals(true, { message: 'Confirm that the marks are complete before submitting.' })
  confirm: true;
}
