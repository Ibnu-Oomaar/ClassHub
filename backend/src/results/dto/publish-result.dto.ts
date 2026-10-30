import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/** Used for both publishing and unpublishing the results of one examination. */
export class PublishResultDto {
  @ApiProperty()
  @IsUUID()
  examinationId: string;
}
