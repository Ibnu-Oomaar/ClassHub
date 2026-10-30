import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { Paginated } from '../common/pagination/pagination.util';
import { AssignTeacherSubjectDto } from './dto/assign-teacher-subject.dto';
import { TeacherSubjectQueryDto } from './dto/teacher-subject-query.dto';
import { UpdateTeacherSubjectDto } from './dto/update-teacher-subject.dto';
import { TeacherSubjectsService } from './teacher-subjects.service';
import { TeacherSubjectView } from './types/teacher-subject.types.interface';

/** Only the Class Master decides who teaches what. Teachers cannot assign themselves. */
@ApiTags('teacher-subjects')
@ApiBearerAuth()
@Roles(Role.CLASS_MASTER)
@Controller('teacher-subjects')
export class TeacherSubjectsController {
  constructor(private readonly teacherSubjects: TeacherSubjectsService) {}

  @Post()
  @ApiOperation({ summary: 'Assign a teacher to a subject' })
  assign(@Body() dto: AssignTeacherSubjectDto, @CurrentUser() user: AuthenticatedUser): Promise<TeacherSubjectView> {
    return this.teacherSubjects.assign(dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'List teacher-subject assignments' })
  list(@Query() query: TeacherSubjectQueryDto): Promise<Paginated<TeacherSubjectView>> {
    return this.teacherSubjects.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One assignment' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<TeacherSubjectView> {
    return this.teacherSubjects.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Move an assignment to another teacher or subject' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTeacherSubjectDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TeacherSubjectView> {
    return this.teacherSubjects.update(id, dto, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove a teacher from a subject' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<{ deleted: true }> {
    return this.teacherSubjects.remove(id, user);
  }
}
