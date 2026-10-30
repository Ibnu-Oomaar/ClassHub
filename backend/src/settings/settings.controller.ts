import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { SettingsService } from './settings.service';
import { SettingsView } from './types/settings.types.interface';

@ApiTags('settings')
@ApiBearerAuth()
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Class name, academic period and submission switch (any signed-in user)' })
  get(): Promise<SettingsView> {
    return this.settings.getView();
  }

  @Patch()
  @Roles(Role.CLASS_MASTER)
  @ApiOperation({ summary: 'Update class settings (Class Master only)' })
  update(@Body() dto: UpdateSettingsDto, @CurrentUser() user: AuthenticatedUser): Promise<SettingsView> {
    return this.settings.update(dto, user);
  }
}
