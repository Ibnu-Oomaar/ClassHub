import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { Paginated } from '../common/pagination/pagination.util';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { MeView, UserView } from './types/user.types.interface';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'The signed-in user (used by the frontend to restore a session)' })
  getMe(@CurrentUser() user: AuthenticatedUser): Promise<MeView> {
    return this.users.getMe(user);
  }

  @Patch('me')
  @Roles(Role.CLASS_MASTER, Role.TEACHER)
  @ApiOperation({ summary: 'Update your own name, username or email (Class Master / Teacher)' })
  updateMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateUserDto): Promise<MeView> {
    return this.users.updateOwnAccount(user, dto);
  }

  @Get()
  @Roles(Role.CLASS_MASTER)
  @ApiOperation({ summary: 'Overview of every account (Class Master only)' })
  list(@Query() query: UserQueryDto): Promise<Paginated<UserView>> {
    return this.users.list(query);
  }

  @Get(':id')
  @Roles(Role.CLASS_MASTER)
  @ApiOperation({ summary: 'One account (Class Master only)' })
  getOne(@Param('id', ParseUUIDPipe) id: string): Promise<UserView> {
    return this.users.getView(id);
  }
}
