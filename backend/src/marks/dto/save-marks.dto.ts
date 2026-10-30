import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, ValidateNested } from 'class-validator';
import { MarkEntryDto } from './create-mark.dto';

/** Saves (creates, changes or clears) many entries of one mark sheet in a single transaction. */
export class SaveMarksDto {
  @ApiProperty({ type: [MarkEntryDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => MarkEntryDto)
  entries: MarkEntryDto[];
}
