import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { Paginated } from '../common/pagination/pagination.util';
import { AnnouncementsService } from './announcements.service';
import { AnnouncementQueryDto } from './dto/announcement-query.dto';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';
import { UpdateAnnouncementDto } from './dto/update-announcement.dto';
import { AnnouncementView } from './types/announcement.types.interface';

@ApiTags('announcements')
@ApiBearerAuth()
@Controller('announcements')
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Post()
  @Roles(Role.CLASS_MASTER)
  @ApiOperation({ summary: 'Publish an announcement or save a draft (Class Master)' })
  create(@Body() dto: CreateAnnouncementDto, @CurrentUser() user: AuthenticatedUser): Promise<AnnouncementView> {
    return this.announcements.create(dto, user);
  }

  @Get()
  @ApiOperation({ summary: 'Announcements. Class Master: all and drafts. Teachers and students: live ones addressed to them' })
  list(@Query() query: AnnouncementQueryDto, @CurrentUser() user: AuthenticatedUser): Promise<Paginated<AnnouncementView>> {
    return this.announcements.list(query, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'One announcement (same visibility rules as the list)' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<AnnouncementView> {
    return this.announcements.findOne(id, user);
  }

  @Patch(':id')
  @Roles(Role.CLASS_MASTER)
  @ApiOperation({ summary: 'Edit, pin, expire, publish or unpublish an announcement (Class Master)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAnnouncementDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<AnnouncementView> {
    return this.announcements.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.CLASS_MASTER)
  @ApiOperation({ summary: 'Delete an announcement (Class Master)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<{ id: string }> {
    return this.announcements.remove(id, user);
  }
}
