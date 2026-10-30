import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { AccountStatus } from '../../common/enums/account-status.enum';

export class UpdateStudentStatusDto {
  @ApiProperty({ enum: AccountStatus, description: 'Suspended and deactivated students cannot sign in.' })
  @IsEnum(AccountStatus)
  status: AccountStatus;
}
