import { Controller, Get, Header } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { DashboardService } from './dashboard.service';
import { DashboardView } from './types/dashboard.types.interface';

@ApiTags('dashboard')
@ApiBearerAuth()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Home-page figures for the signed-in role, counted from real data (all roles)' })
  get(@CurrentUser() user: AuthenticatedUser): Promise<DashboardView> {
    return this.dashboard.get(user);
  }
}
