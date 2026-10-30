import { Body, Controller, Get, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { Paginated } from '../common/pagination/pagination.util';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { GradeSubmissionDto } from './dto/grade-submission.dto';
import { SubmissionQueryDto } from './dto/submission-query.dto';
import { UpdateSubmissionDto } from './dto/update-submission.dto';
import { SubmissionsService } from './submissions.service';
import { AssignmentOverview, SubmissionView } from './types/submission.types.interface';

@ApiTags('submissions')
@ApiBearerAuth()
@Controller('submissions')
export class SubmissionsController {
  constructor(private readonly submissions: SubmissionsService) {}

  // ----- Student ----------------------------------------------------------------------------------

  @Post()
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: 'Submit your work for an assignment (Student)' })
  create(@Body() dto: CreateSubmissionDto, @CurrentUser() user: AuthenticatedUser): Promise<SubmissionView> {
    return this.submissions.create(dto, user);
  }

  @Get('my')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: 'My submissions. Scores and feedback appear once the teacher releases them (Student)' })
  mine(@Query() query: SubmissionQueryDto, @CurrentUser() user: AuthenticatedUser): Promise<Paginated<SubmissionView>> {
    return this.submissions.mine(query, user);
  }

  @Patch(':id')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: 'Change my submission before it is graded (Student)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubmissionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SubmissionView> {
    return this.submissions.update(id, dto, user);
  }

  // ----- Staff ------------------------------------------------------------------------------------

  @Get()
  @Roles(Role.CLASS_MASTER, Role.TEACHER)
  @ApiOperation({ summary: 'List submissions (Class Master: all; Teacher: their subjects)' })
  list(@Query() query: SubmissionQueryDto, @CurrentUser() user: AuthenticatedUser): Promise<Paginated<SubmissionView>> {
    return this.submissions.list(query, user);
  }

  @Get('assignment/:assignmentId/overview')
  @Roles(Role.CLASS_MASTER, Role.TEACHER)
  @ApiOperation({ summary: 'Who submitted, who is late and who is missing for one assignment' })
  overview(@Param('assignmentId', ParseUUIDPipe) assignmentId: string, @CurrentUser() user: AuthenticatedUser): Promise<AssignmentOverview> {
    return this.submissions.overview(assignmentId, user);
  }

  @Post(':id/grade')
  @HttpCode(200)
  @Roles(Role.TEACHER)
  @ApiOperation({ summary: 'Grade a submission and give feedback (Teacher of the subject)' })
  grade(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: GradeSubmissionDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SubmissionView> {
    return this.submissions.grade(id, dto, user);
  }

  // ----- Shared (authorized per role in the service) ----------------------------------------------

  @Get(':id')
  @ApiOperation({ summary: 'One submission: yours (student), your subject\'s (teacher) or any (Class Master)' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<SubmissionView> {
    return this.submissions.findOne(id, user);
  }

  @Get(':id/file')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Download the file of a submission' })
  file(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<StreamableFile> {
    return this.submissions.downloadFile(id, user);
  }
}
