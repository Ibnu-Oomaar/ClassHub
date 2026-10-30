import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';

export class ResultQueryDto extends PaginationQueryDto {
  @ApiProperty({ description: 'Examination whose standings to list' })
  @IsUUID()
  examinationId: string;
}
