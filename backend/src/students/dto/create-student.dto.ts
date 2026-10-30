import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsIn, IsISO8601, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { Trim, TrimToNull } from '../../common/decorators/trim.decorator';
import { AccountStatus } from '../../common/enums/account-status.enum';
import { Gender } from '../../common/enums/gender.enum';
import { normalizeStudentId } from '../../common/utils/name.util';

export class CreateStudentDto {
  @ApiProperty({ example: 'Abdirahman Ahmed Ali' })
  @Trim()
  @IsString()
  @MinLength(2, { message: 'Full name must be at least 2 characters.' })
  @MaxLength(150)
  fullName: string;

  @ApiProperty({ example: 'ST-001', description: 'Unique. Stored upper-case without spaces.' })
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? normalizeStudentId(value) : value))
  @IsString()
  @Matches(/^[A-Z0-9][A-Z0-9._/-]{0,39}$/, {
    message: 'Student ID may contain letters, numbers, dot, dash, underscore or slash (max 40 characters).',
  })
  studentId: string;

  @ApiPropertyOptional({ enum: Gender, nullable: true })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender | null;

  @ApiPropertyOptional({ example: '2010-05-14', nullable: true })
  @IsOptional()
  @TrimToNull()
  @IsISO8601({ strict: true }, { message: 'Date of birth must be a valid date (YYYY-MM-DD).' })
  dateOfBirth?: string | null;

  @ApiPropertyOptional({ example: '+252 63 4000000', nullable: true })
  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(40)
  @Matches(/^[0-9+()\-\s.]{5,40}$/, { message: 'Phone may only contain digits, spaces and + ( ) - .' })
  phone?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @TrimToNull()
  @IsEmail()
  @MaxLength(255)
  email?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(500)
  address?: string | null;

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
