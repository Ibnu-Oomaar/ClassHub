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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { Paginated } from '../common/pagination/pagination.util';
import { CreateTeacherDto } from './dto/create-teacher.dto';
import { TeacherQueryDto } from './dto/teacher-query.dto';
import { UpdateTeacherStatusDto } from './dto/update-teacher-status.dto';
import { UpdateTeacherDto } from './dto/update-teacher.dto';
import { TeachersService } from './teachers.service';
import { TeacherProfileView } from './types/teacher.types.interface';

/** Teachers never register themselves: every account is created here by the Class Master. */
@ApiTags('teachers')
@ApiBearerAuth()
@Controller('teachers')
export class TeachersController {
  constructor(private readonly teachers: TeachersService) {}

  @Post()
  @Roles(Role.CLASS_MASTER)
  @ApiOperation({ summary: 'Create a teacher account (Class Master only)' })
  create(@Body() dto: CreateTeacherDto, @CurrentUser() user: AuthenticatedUser): Promise<TeacherProfileView> {
    return this.teachers.create(dto, user);
  }

  @Get()
  @Roles(Role.CLASS_MASTER)
  @ApiOperation({ summary: 'List teachers with their assigned subjects (Class Master only)' })
  list(@Query() query: TeacherQueryDto, @CurrentUser() user: AuthenticatedUser) {
    return this.teachers.list(query, user) as Promise<Paginated<TeacherProfileView>>;
  }

  @Get('me')
  @Roles(Role.TEACHER)
  @ApiOperation({ summary: 'The signed-in teacher\'s own profile and assigned subjects' })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.teachers.findMe(user);
  }

  @Get('me/photo')
  @Roles(Role.TEACHER)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'The signed-in teacher\'s own photo' })
  myPhoto(@CurrentUser() user: AuthenticatedUser): Promise<StreamableFile> {
    return this.teachers.getMyPhoto(user);
  }

  @Get(':id')
  @Roles(Role.CLASS_MASTER)
  @ApiOperation({ summary: 'One teacher profile (Class Master only)' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<TeacherProfileView> {
    return this.teachers.getProfile(id);
  }

  @Get(':id/photo')
  @Roles(Role.CLASS_MASTER)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'A teacher\'s profile photo (Class Master only)' })
  photo(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<StreamableFile> {
    return this.teachers.getPhoto(id, user);
  }

  @Patch(':id')
  @Roles(Role.CLASS_MASTER)
  @ApiOperation({ summary: 'Update teacher information or reset the password (Class Master only)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTeacherDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TeacherProfileView> {
    return this.teachers.update(id, dto, user);
  }

  @Patch(':id/status')
  @Roles(Role.CLASS_MASTER)
  @ApiOperation({ summary: 'Activate, suspend or deactivate a teacher (Class Master only)' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTeacherStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TeacherProfileView> {
    return this.teachers.updateStatus(id, dto.status, user);
  }

  @Delete(':id')
  @Roles(Role.CLASS_MASTER)
  @ApiOperation({ summary: 'Remove a teacher (soft delete) and clear their subject assignments' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<{ deleted: true }> {
    return this.teachers.remove(id, user);
  }

  @Post(':id/restore')
  @HttpCode(200)
  @Roles(Role.CLASS_MASTER)
  @ApiOperation({ summary: 'Restore a removed teacher' })
  restore(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<TeacherProfileView> {
    return this.teachers.restore(id, user);
  }
}
