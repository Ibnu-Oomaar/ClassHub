import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { Paginated } from '../common/pagination/pagination.util';
import { PublishResultDto } from './dto/publish-result.dto';
import { ResultQueryDto } from './dto/result-query.dto';
import { ResultsService } from './results.service';
import {
  ExaminationStandingsView,
  MyResultDetail,
  MyResultSummary,
  PublishOutcome,
  StandingRowView,
} from './types/result.types.interface';

@ApiTags('results')
@ApiBearerAuth()
@Controller('results')
export class ResultsController {
  constructor(private readonly results: ResultsService) {}

  // ----- Student: only ever their own published results ------------------------------------------

  @Get('my')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: 'My published results, newest first (Student)' })
  my(@CurrentUser() user: AuthenticatedUser): Promise<MyResultSummary[]> {
    return this.results.myResults(user);
  }

  @Get('my/:examinationId')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: 'My published result for one examination, with subject grades (Student)' })
  myOne(@Param('examinationId', ParseUUIDPipe) examinationId: string, @CurrentUser() user: AuthenticatedUser): Promise<MyResultDetail> {
    return this.results.myResult(examinationId, user);
  }

  // ----- Class Master -----------------------------------------------------------------------------

  @Get('examination/:examinationId/standings')
  @Roles(Role.CLASS_MASTER)
  @ApiOperation({
    summary: 'Full standings of an examination with publish readiness (Class Master)',
    description: 'Calculated live from approved marks until published, then the frozen published values.',
  })
  standings(@Param('examinationId', ParseUUIDPipe) examinationId: string): Promise<ExaminationStandingsView> {
    return this.results.getStandings(examinationId);
  }

  @Get()
  @Roles(Role.CLASS_MASTER)
  @ApiOperation({ summary: 'Ranked results of an examination, paginated (Class Master)' })
  list(@Query() query: ResultQueryDto): Promise<Paginated<StandingRowView>> {
    return this.results.list(query);
  }

  @Post('publish')
  @HttpCode(200)
  @Roles(Role.CLASS_MASTER)
  @ApiOperation({
    summary: 'Publish approved results so students can see them (Class Master only)',
    description: 'Requires every subject to be approved and a grading scale to be active. Freezes totals, grades and ranks.',
  })
  publish(@Body() dto: PublishResultDto, @CurrentUser() user: AuthenticatedUser): Promise<PublishOutcome> {
    return this.results.publish(dto, user);
  }

  @Post('unpublish')
  @HttpCode(200)
  @Roles(Role.CLASS_MASTER)
  @ApiOperation({ summary: 'Hide published results from students again (Class Master only)' })
  unpublish(@Body() dto: PublishResultDto, @CurrentUser() user: AuthenticatedUser): Promise<PublishOutcome> {
    return this.results.unpublish(dto, user);
  }
}
