import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { StrongPassword } from '../../common/decorators/password.decorator';
import { Trim, TrimToNull } from '../../common/decorators/trim.decorator';

/** The first Class Master. This is the only account the setup wizard creates. */
export class InitialSetupDto {
  @ApiProperty({ example: 'Amina Yusuf' })
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  fullName: string;

  @ApiProperty({ example: 'classmaster', description: 'Letters, numbers, dot, underscore or dash' })
  @Trim()
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  @Matches(/^[A-Za-z0-9._-]+$/, { message: 'Username may only contain letters, numbers, dot, underscore and dash.' })
  username: string;

  @ApiPropertyOptional({ example: 'amina@example.com', nullable: true })
  @IsOptional()
  @TrimToNull()
  @IsEmail()
  @MaxLength(255)
  email?: string | null;

  @ApiProperty({ description: 'At least 8 characters with a letter and a number' })
  @StrongPassword()
  password: string;

  @ApiProperty({ description: 'Must match the password' })
  @IsString()
  @IsNotEmpty()
  confirmPassword: string;
}
