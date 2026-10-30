import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { Paginated } from '../common/pagination/pagination.util';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { SubjectQueryDto } from './dto/subject-query.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';
import { SubjectsService } from './subjects.service';
import { SubjectView } from './types/subject.types.interface';

@ApiTags('subjects')
@ApiBearerAuth()
@Controller('subjects')
export class SubjectsController {
  constructor(private readonly subjects: SubjectsService) {}

  @Post()
  @Roles(Role.CLASS_MASTER)
  @ApiOperation({ summary: 'Create a subject (Class Master only)' })
  create(@Body() dto: CreateSubjectDto, @CurrentUser() user: AuthenticatedUser): Promise<SubjectView> {
    return this.subjects.create(dto, user);
  }

  @Get()
  @ApiOperation({
    summary: 'List subjects',
    description: 'Class Master: all subjects. Teacher: only assigned subjects. Student: active subjects with their teachers.',
  })
  list(@Query() query: SubjectQueryDto, @CurrentUser() user: AuthenticatedUser): Promise<Paginated<SubjectView>> {
    return this.subjects.list(query, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One subject (teachers: only their own subjects)' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<SubjectView> {
    return this.subjects.findOne(id, user);
  }

  @Patch(':id')
  @Roles(Role.CLASS_MASTER)
  @ApiOperation({ summary: 'Edit a subject or activate/deactivate it (Class Master only)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubjectDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<SubjectView> {
    return this.subjects.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.CLASS_MASTER)
  @ApiOperation({ summary: 'Delete an unused subject (Class Master only). Use deactivate for subjects with history.' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<{ deleted: true }> {
    return this.subjects.remove(id, user);
  }
}
