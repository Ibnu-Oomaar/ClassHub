import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { TrimToNull } from '../../common/decorators/trim.decorator';

/** Changes one existing mark. Only the fields you send are changed. */
export class UpdateMarkDto {
  @ApiPropertyOptional({ example: 80, nullable: true })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'A score can have at most 2 decimal places.' })
  @Min(0, { message: 'A score cannot be negative.' })
  score?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isAbsent?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @TrimToNull()
  @IsString()
  @MaxLength(255)
  remarks?: string | null;
}
