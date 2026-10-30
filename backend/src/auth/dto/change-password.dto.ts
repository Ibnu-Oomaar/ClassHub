import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { StrongPassword } from '../../common/decorators/password.decorator';

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  currentPassword: string;

  @ApiProperty({ description: 'At least 8 characters with a letter and a number' })
  @StrongPassword()
  newPassword: string;
}
