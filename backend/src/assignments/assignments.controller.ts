import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { Paginated } from '../common/pagination/pagination.util';
import { AssignmentsService } from './assignments.service';
import { AssignmentQueryDto } from './dto/assignment-query.dto';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { UpdateAssignmentAvailabilityDto } from './dto/update-assignment-availability.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';
import { AssignmentView } from './types/assignment.types.interface';

@ApiTags('assignments')
@ApiBearerAuth()
@Controller('assignments')
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Post()
  @Roles(Role.TEACHER)
  @ApiOperation({ summary: 'Create an assignment for one of your subjects (Teacher only)' })
  create(@Body() dto: CreateAssignmentDto, @CurrentUser() user: AuthenticatedUser): Promise<AssignmentView> {
    return this.assignments.create(dto, user);
  }

  @Get()
  @ApiOperation({
    summary: 'List assignments',
    description:
      'Class Master: all. Teacher: assignments of their subjects. Student: available assignments with their own submission status.',
  })
  list(@Query() query: AssignmentQueryDto, @CurrentUser() user: AuthenticatedUser): Promise<Paginated<AssignmentView>> {
    return this.assignments.list(query, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One assignment, scoped to what the caller may see' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<AssignmentView> {
    return this.assignments.findOne(id, user);
  }

  @Get(':id/attachments/:fileId')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Download an assignment attachment' })
  downloadAttachment(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StreamableFile> {
    return this.assignments.downloadAttachment(id, fileId, user);
  }

  @Patch(':id')
  @Roles(Role.TEACHER)
  @ApiOperation({ summary: 'Edit your own assignment, including its deadline and attachments (Teacher only)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAssignmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AssignmentView> {
    return this.assignments.update(id, dto, user);
  }

  @Patch(':id/availability')
  @Roles(Role.CLASS_MASTER, Role.TEACHER)
  @ApiOperation({ summary: 'Show or hide an assignment for students (Class Master, or the owning teacher)' })
  setAvailability(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAssignmentAvailabilityDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AssignmentView> {
    return this.assignments.setAvailability(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.TEACHER)
  @ApiOperation({ summary: 'Delete your own assignment while it has no submissions (Teacher only)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<{ deleted: true }> {
    return this.assignments.remove(id, user);
  }
}
