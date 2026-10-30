import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

/** Shows or hides an assignment for students. Class Master and the owning teacher may do this. */
export class UpdateAssignmentAvailabilityDto {
  @ApiProperty()
  @IsBoolean()
  isAvailable: boolean;
}
