import { PartialType } from '@nestjs/swagger';
import { CreateSubjectDto } from './create-subject.dto';

/** Every field is optional. `isActive` activates or deactivates the subject. */
export class UpdateSubjectDto extends PartialType(CreateSubjectDto) {}
