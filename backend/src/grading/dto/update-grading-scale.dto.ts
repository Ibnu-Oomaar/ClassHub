import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateGradingScaleDto } from './create-grading-scale.dto';

/** Send `bands` to replace the whole band list. Activation uses POST /grading/:id/activate. */
export class UpdateGradingScaleDto extends PartialType(OmitType(CreateGradingScaleDto, ['activate'] as const)) {}
