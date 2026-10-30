import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsOptional, IsUUID } from 'class-validator';
import { MAX_ASSIGNMENT_ATTACHMENTS } from '../types/assignment.types.interface';
import { CreateAssignmentDto } from './create-assignment.dto';

/** The subject of an assignment cannot change. Attachments are added and removed explicitly. */
export class UpdateAssignmentDto extends PartialType(OmitType(CreateAssignmentDto, ['subjectId', 'attachmentFileIds'] as const)) {
  @ApiPropertyOptional({ type: [String], description: 'Uploaded files to attach' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ASSIGNMENT_ATTACHMENTS)
  @IsUUID('all', { each: true })
  addAttachmentFileIds?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Attached files to remove' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_ASSIGNMENT_ATTACHMENTS)
  @IsUUID('all', { each: true })
  removeAttachmentFileIds?: string[];
}
