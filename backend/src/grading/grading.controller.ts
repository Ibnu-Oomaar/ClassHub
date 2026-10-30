import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginationQueryDto } from '../common/pagination/pagination-query.dto';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { Paginated } from '../common/pagination/pagination.util';
import { CreateGradingScaleDto } from './dto/create-grading-scale.dto';
import { UpdateGradingScaleDto } from './dto/update-grading-scale.dto';
import { GradingService } from './grading.service';
import { GradingScaleView } from './types/grading.types.interface';

@ApiTags('grading')
@ApiBearerAuth()
@Controller('grading')
export class GradingController {
  constructor(private readonly grading: GradingService) {}

  /** Declared before `:id` so "active" is never parsed as an id. */
  @Get('active')
  @ApiOperation({ summary: 'The active grading scale, or null when none is configured (any signed-in user)' })
  getActive(): Promise<GradingScaleView | null> {
    return this.grading.getActive();
  }

  @Post()
  @Roles(Role.CLASS_MASTER)
  @ApiOperation({ summary: 'Create a grading scale with its bands (Class Master only)' })
  create(@Body() dto: CreateGradingScaleDto, @CurrentUser() user: AuthenticatedUser): Promise<GradingScaleView> {
    return this.grading.create(dto, user);
  }

  @Get()
  @Roles(Role.CLASS_MASTER)
  @ApiOperation({ summary: 'List grading scales (Class Master only)' })
  list(@Query() query: PaginationQueryDto): Promise<Paginated<GradingScaleView>> {
    return this.grading.list(query);
  }

  @Get(':id')
  @Roles(Role.CLASS_MASTER)
  @ApiOperation({ summary: 'One grading scale (Class Master only)' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<GradingScaleView> {
    return this.grading.findOne(id);
  }

  @Patch(':id')
  @Roles(Role.CLASS_MASTER)
  @ApiOperation({ summary: 'Rename a scale or replace its bands (Class Master only)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateGradingScaleDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<GradingScaleView> {
    return this.grading.update(id, dto, user);
  }

  @Post(':id/activate')
  @HttpCode(200)
  @Roles(Role.CLASS_MASTER)
  @ApiOperation({ summary: 'Make this the active scale; the previously active one is switched off' })
  activate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<GradingScaleView> {
    return this.grading.activate(id, user);
  }

  @Delete(':id')
  @Roles(Role.CLASS_MASTER)
  @ApiOperation({ summary: 'Delete an inactive scale (Class Master only)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<{ deleted: true }> {
    return this.grading.remove(id, user);
  }
}
