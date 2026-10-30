import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { StrongPassword } from '../../common/decorators/password.decorator';
import { Trim, TrimToNull } from '../../common/decorators/trim.decorator';
import { AccountStatus } from '../../common/enums/account-status.enum';
import { Gender } from '../../common/enums/gender.enum';

export class CreateTeacherDto {
  @ApiProperty({ example: 'Mohamed Hassan Nur' })
  @Trim()
  @IsString()
  @MinLength(2, { message: 'Full name must be at least 2 characters.' })
  @MaxLength(150)
  fullName: string;

  @ApiPropertyOptional({ example: 'm.hassan', description: 'Provide a username, an email, or both.' })
  @ValidateIf((dto: CreateTeacherDto) => !dto.email || dto.username !== undefined)
  @TrimToNull()
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  @Matches(/^[A-Za-z0-9._-]+$/, { message: 'Username may only contain letters, numbers, dot, underscore and dash.' })
  username?: string | null;

  @ApiPropertyOptional({ example: 'm.hassan@example.com' })
  @IsOptional()
  @TrimToNull()
  @IsEmail()
  @MaxLength(255)
  email?: string | null;

  @ApiProperty({ description: 'At least 8 characters with a letter and a number. Shared with the teacher by the Class Master.' })
  @StrongPassword()
  password: string;

  @ApiPropertyOptional({ enum: Gender, nullable: true })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(40)
  @Matches(/^[0-9+()\-\s.]{5,40}$/, { message: 'Phone may only contain digits, spaces and + ( ) - .' })
  phone?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(500)
  address?: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'BSc Physics, University of Hargeisa' })
  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(255)
  qualification?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Private notes, visible to the Class Master only' })
  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(2000)
  notes?: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Id returned by POST /files/upload with category PROFILE_PHOTO' })
  @IsOptional()
  @IsUUID()
  profilePhotoFileId?: string | null;

  @ApiPropertyOptional({ enum: [AccountStatus.ACTIVE, AccountStatus.SUSPENDED], default: AccountStatus.ACTIVE })
  @IsOptional()
  @IsIn([AccountStatus.ACTIVE, AccountStatus.SUSPENDED])
  status?: AccountStatus;
}
