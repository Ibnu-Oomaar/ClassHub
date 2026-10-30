import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { Paginated } from '../common/pagination/pagination.util';
import { CreateExaminationDto } from './dto/create-examination.dto';
import { ExaminationQueryDto } from './dto/examination-query.dto';
import { UpdateExaminationDto } from './dto/update-examination.dto';
import { ExaminationsService } from './examinations.service';
import { ExaminationView } from './types/examination.types.interface';

@ApiTags('examinations')
@ApiBearerAuth()
@Controller('examinations')
export class ExaminationsController {
  constructor(private readonly examinations: ExaminationsService) {}

  @Post()
  @Roles(Role.CLASS_MASTER)
  @ApiOperation({ summary: 'Create an examination with its subjects and maximum marks (Class Master only)' })
  create(@Body() dto: CreateExaminationDto, @CurrentUser() user: AuthenticatedUser): Promise<ExaminationView> {
    return this.examinations.create(dto, user);
  }

  @Get()
  @ApiOperation({
    summary: 'List examinations',
    description:
      'Class Master: all. Teacher: non-draft examinations containing their subjects (only those subjects are shown). Student: non-draft examinations (schedule only).',
  })
  list(@Query() query: ExaminationQueryDto, @CurrentUser() user: AuthenticatedUser): Promise<Paginated<ExaminationView>> {
    return this.examinations.list(query, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One examination, scoped to what the caller may see' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<ExaminationView> {
    return this.examinations.findOne(id, user);
  }

  @Patch(':id')
  @Roles(Role.CLASS_MASTER)
  @ApiOperation({ summary: 'Edit an examination, its status or its subjects (Class Master only)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExaminationDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ExaminationView> {
    return this.examinations.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.CLASS_MASTER)
  @ApiOperation({ summary: 'Delete an examination that has no marks (Class Master only)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<{ deleted: true }> {
    return this.examinations.remove(id, user);
  }
}
