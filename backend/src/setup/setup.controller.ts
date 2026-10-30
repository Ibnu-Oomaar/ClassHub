import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { InitialSetupDto } from './dto/initial-setup.dto';
import { SetupService } from './setup.service';
import { SetupResult, SetupStatus } from './types/setup.types.interface';

/** Public only until the first Class Master exists; afterwards POST /setup/initial is refused. */
@ApiTags('setup')
@Public()
@Controller('setup')
export class SetupController {
  constructor(private readonly setup: SetupService) {}

  @Get('status')
  @ApiOperation({ summary: 'Has the first-run setup been completed?' })
  status(): Promise<SetupStatus> {
    return this.setup.getStatus();
  }

  @Post('initial')
  @HttpCode(201)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Create the first Class Master. Works exactly once.' })
  initial(@Body() dto: InitialSetupDto, @Req() req: Request): Promise<SetupResult> {
    return this.setup.run(dto, req.ip ?? null);
  }
}
