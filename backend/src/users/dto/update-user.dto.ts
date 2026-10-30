import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Trim, TrimToNull } from '../../common/decorators/trim.decorator';

/** Staff (Class Master / Teacher) editing their own account details. */
export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'Amina Yusuf' })
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(150)
  fullName?: string;

  @ApiPropertyOptional({ example: 'amina.yusuf', description: 'Letters, numbers, dot, underscore or dash' })
  @IsOptional()
  @TrimToNull()
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  @Matches(/^[A-Za-z0-9._-]+$/, { message: 'Username may only contain letters, numbers, dot, underscore and dash.' })
  username?: string | null;

  @ApiPropertyOptional({ example: 'amina@example.com' })
  @IsOptional()
  @TrimToNull()
  @IsEmail()
  @MaxLength(255)
  email?: string | null;
}
