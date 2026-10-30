import { PartialType } from '@nestjs/swagger';
import { CreateExaminationDto } from './create-examination.dto';

/**
 * Every field is optional. `subjects`, when sent, is the full desired list: new subjects are
 * added, listed ones keep their marks, and omitted ones are removed (only when no marks exist).
 */
export class UpdateExaminationDto extends PartialType(CreateExaminationDto) {}
