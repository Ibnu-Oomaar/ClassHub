import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Trim, TrimToNull } from '../../common/decorators/trim.decorator';

export class CreateSubjectDto {
  @ApiProperty({ example: 'Physics' })
  @Trim()
  @IsString()
  @MinLength(2, { message: 'Subject name must be at least 2 characters.' })
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ example: 'PHY', nullable: true })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') return value;
    const code = value.trim().toUpperCase();
    return code === '' ? null : code;
  })
  @IsString()
  @Matches(/^[A-Z0-9._-]{1,20}$/, { message: 'Code may contain letters, numbers, dot, dash and underscore (max 20).' })
  code?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
