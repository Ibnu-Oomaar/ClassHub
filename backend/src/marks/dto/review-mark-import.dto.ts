import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export class ReviewMarkImportEntryDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  studentCode: string;

  @ApiPropertyOptional({ maxLength: 150 })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  studentName?: string;

  @ApiProperty()
  @IsString()
  @MaxLength(40)
  score: string;

  @ApiProperty()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  recordNumber: number;
}

export class ReviewMarkImportDto {
  @ApiProperty({ type: [ReviewMarkImportEntryDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ReviewMarkImportEntryDto)
  records: ReviewMarkImportEntryDto[];
}
