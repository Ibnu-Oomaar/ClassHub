import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export class ConfirmMarkImportEntryDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(40)
  studentCode: string;

  @ApiProperty({ example: 72.5 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  score: number;

  @ApiProperty({ nullable: true, description: 'Existing score shown in the preview, used to reject a stale overwrite.' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  expectedCurrentScore: number | null;
}

export class ConfirmMarkImportDto {
  @ApiProperty({ type: [ConfirmMarkImportEntryDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => ConfirmMarkImportEntryDto)
  entries: ConfirmMarkImportEntryDto[];

  @ApiProperty({ description: 'Must be true when any existing score will be replaced.' })
  @IsBoolean()
  overwriteExisting: boolean;
}
