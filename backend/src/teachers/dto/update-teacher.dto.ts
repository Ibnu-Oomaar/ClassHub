import { ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { StrongPassword } from '../../common/decorators/password.decorator';
import { CreateTeacherDto } from './create-teacher.dto';

/**
 * Every field is optional. Send `null` for an optional field to clear it.
 * Status changes go through PATCH /teachers/:id/status. `password` resets the teacher's password.
 */
export class UpdateTeacherDto extends PartialType(OmitType(CreateTeacherDto, ['status', 'password'] as const)) {
  @ApiPropertyOptional({ description: 'Set a new password (also signs the teacher out everywhere).' })
  @IsOptional()
  @StrongPassword()
  password?: string;
}
