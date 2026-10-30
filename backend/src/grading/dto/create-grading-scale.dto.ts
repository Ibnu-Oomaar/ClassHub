import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Trim, TrimToNull } from '../../common/decorators/trim.decorator';

export class GradeBandDto {
  @ApiProperty({ example: 'A' })
  @Trim()
  @IsString()
  @MinLength(1)
  @MaxLength(10)
  grade: string;

  @ApiProperty({ example: 25, description: 'Lowest actual mark included in this grade range' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  minMark: number;

  @ApiProperty({ example: 30, description: 'Highest actual mark included in this grade range' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  maxMark: number;

  @ApiPropertyOptional({ example: 'Excellent', nullable: true })
  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(60)
  remark?: string | null;

  @ApiPropertyOptional({ default: true, description: 'Counts as a pass in pass-rate statistics' })
  @IsOptional()
  @IsBoolean()
  isPassing?: boolean;
}

export class CreateGradingScaleDto {
  @ApiProperty({ example: 'Standard scale' })
  @Trim()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @ApiProperty({ example: 30, description: 'Maximum marks represented by this grading scale' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  maxMark: number;

  @ApiProperty({ type: [GradeBandDto], description: 'Must include a band that starts at 0; ranges must not overlap or exceed maxMark' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => GradeBandDto)
  bands: GradeBandDto[];

  @ApiPropertyOptional({ default: false, description: 'Make this the active scale immediately' })
  @IsOptional()
  @IsBoolean()
  activate?: boolean;
}
