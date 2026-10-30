import { PartialType } from '@nestjs/swagger';
import { CreateAnnouncementDto } from './create-announcement.dto';

/** Every field is optional. Send `expiresAt: null` to remove an expiry. */
export class UpdateAnnouncementDto extends PartialType(CreateAnnouncementDto) {}
