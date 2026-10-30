import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { Paginated } from '../common/pagination/pagination.util';
import { CreateStudentDto } from './dto/create-student.dto';
import { StudentProfileDto } from './dto/student-profile.dto';
import { StudentQueryDto } from './dto/student-query.dto';
import { UpdateStudentStatusDto } from './dto/update-student-status.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { StudentsService } from './students.service';
import { StudentProfileView, StudentSelfView, StudentSummaryView } from './types/student.types.interface';

@ApiTags('students')
@ApiBearerAuth()
@Controller('students')
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Post()
  @Roles(Role.CLASS_MASTER)
  @ApiOperation({ summary: 'Register a student (Class Master only; students cannot self-register)' })
  @ApiOkResponse({ type: StudentProfileDto })
  create(@Body() dto: CreateStudentDto, @CurrentUser() user: AuthenticatedUser): Promise<StudentProfileView> {
    return this.students.create(dto, user);
  }

  @Get()
  @Roles(Role.CLASS_MASTER, Role.TEACHER)
  @ApiOperation({
    summary: 'List students',
    description: 'Class Master receives full records; teachers receive a reduced projection without private contact details.',
  })
  list(
    @Query() query: StudentQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<Paginated<StudentProfileView | StudentSummaryView>> {
    return this.students.list(query, user);
  }

  @Get('me')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: 'The signed-in student\'s own official profile' })
  me(@CurrentUser() user: AuthenticatedUser): Promise<StudentSelfView> {
    return this.students.findMe(user);
  }

  @Get('me/photo')
  @Roles(Role.STUDENT)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'The signed-in student\'s own profile photo' })
  myPhoto(@CurrentUser() user: AuthenticatedUser): Promise<StreamableFile> {
    return this.students.getMyPhoto(user);
  }

  @Get(':id')
  @Roles(Role.CLASS_MASTER, Role.TEACHER)
  @ApiOperation({ summary: 'One student (full record for Class Master, reduced for teachers)' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StudentProfileView | StudentSummaryView> {
    return this.students.findOne(id, user);
  }

  @Get(':id/photo')
  @Roles(Role.CLASS_MASTER, Role.TEACHER)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'A student\'s profile photo' })
  photo(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<StreamableFile> {
    return this.students.getPhoto(id, user);
  }

  @Patch(':id')
  @Roles(Role.CLASS_MASTER)
  @ApiOperation({ summary: 'Update any student information (Class Master only)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStudentDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StudentProfileView> {
    return this.students.update(id, dto, user);
  }

  @Patch(':id/status')
  @Roles(Role.CLASS_MASTER)
  @ApiOperation({ summary: 'Activate, suspend or deactivate a student account (Class Master only)' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStudentStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<StudentProfileView> {
    return this.students.updateStatus(id, dto.status, user);
  }

  @Delete(':id')
  @Roles(Role.CLASS_MASTER)
  @ApiOperation({ summary: 'Remove a student (soft delete, can be restored)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<{ deleted: true }> {
    return this.students.remove(id, user);
  }

  @Post(':id/restore')
  @HttpCode(200)
  @Roles(Role.CLASS_MASTER)
  @ApiOperation({ summary: 'Restore a removed student' })
  restore(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<StudentProfileView> {
    return this.students.restore(id, user);
  }
}
