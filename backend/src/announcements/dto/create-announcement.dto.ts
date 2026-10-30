import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsISO8601, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator';
import { AnnouncementAudience } from '../types/announcement.types.interface';

export class CreateAnnouncementDto {
  @ApiProperty({ example: 'Midterm timetable is out' })
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title: string;

  @ApiProperty()
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(10000)
  body: string;

  @ApiPropertyOptional({ enum: AnnouncementAudience, default: AnnouncementAudience.ALL })
  @IsOptional()
  @IsEnum(AnnouncementAudience)
  audience?: AnnouncementAudience;

  @ApiPropertyOptional({ default: false, description: 'Pinned announcements are listed first' })
  @IsOptional()
  @IsBoolean()
  isPinned?: boolean;

  @ApiPropertyOptional({ default: true, description: 'false saves it as a draft nobody else can see' })
  @IsOptional()
  @IsBoolean()
  isPublished?: boolean;

  @ApiPropertyOptional({ nullable: true, example: '2026-12-01T00:00:00Z', description: 'Hidden from students and teachers after this time' })
  @IsOptional()
  @IsISO8601({ strict: true }, { message: 'The expiry must be a valid date and time.' })
  expiresAt?: string | null;
}
