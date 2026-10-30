import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator';

/** Students sign in with exactly two fields. There is no password, email, phone or username. */
export class StudentLoginDto {
  @ApiProperty({ example: 'Abdirahman Ahmed Ali' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  fullName: string;

  @ApiProperty({ example: 'ST-001' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(40)
  studentId: string;
}
