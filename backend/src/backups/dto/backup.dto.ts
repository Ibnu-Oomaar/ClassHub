import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Equals, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { Trim, TrimToNull } from '../../common/decorators/trim.decorator';
import { PaginationQueryDto } from '../../common/pagination/pagination-query.dto';
import { BackupKind } from '../types/backup.types.interface';

export class CreateBackupDto {
  @ApiPropertyOptional({ nullable: true, example: 'Before the term 2 exams' })
  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(300)
  note?: string | null;
}

export class UploadBackupDto {
  @ApiPropertyOptional({ nullable: true, description: 'Optional note shown in the backup list' })
  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(300)
  note?: string | null;
}

/** Restoring replaces ALL current data, so it needs the password and a typed confirmation. */
export class RestoreBackupDto {
  @ApiProperty({ description: 'Your own password, to confirm that it is really you' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;

  @ApiProperty({ example: 'RESTORE', description: 'Type RESTORE to confirm that all current data will be replaced' })
  @Trim()
  @Equals('RESTORE', { message: 'Type RESTORE to confirm.' })
  confirmation: string;
}

export class BackupQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: BackupKind })
  @IsOptional()
  @IsEnum(BackupKind)
  kind?: BackupKind;
}
