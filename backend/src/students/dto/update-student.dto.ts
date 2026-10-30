import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateStudentDto } from './create-student.dto';

/**
 * Every field is optional. Send `null` for an optional field to clear it.
 * Status changes go through PATCH /students/:id/status.
 */
export class UpdateStudentDto extends PartialType(OmitType(CreateStudentDto, ['status'] as const)) {}
