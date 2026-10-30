import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator';

export class ClassMasterLoginDto {
  @ApiProperty({ example: 'classmaster', description: 'Username or email' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  identifier: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;
}
