import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ClassMasterLoginDto } from './dto/class-master-login.dto';
import { StudentLoginDto } from './dto/student-login.dto';
import { TeacherLoginDto } from './dto/teacher-login.dto';
import { LoginResponse } from './types/auth.types.interface';

/** Sign-in routes are limited per IP address on top of the per-account lockout. */
const LOGIN_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle(LOGIN_THROTTLE)
  @Post('class-master-login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Class Master sign-in (username or email + password)' })
  classMasterLogin(@Body() dto: ClassMasterLoginDto, @Req() req: Request): Promise<LoginResponse> {
    return this.auth.staffLogin(Role.CLASS_MASTER, dto.identifier, dto.password, req.ip ?? null);
  }

  @Public()
  @Throttle(LOGIN_THROTTLE)
  @Post('teacher-login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Teacher sign-in (username or email + password)' })
  teacherLogin(@Body() dto: TeacherLoginDto, @Req() req: Request): Promise<LoginResponse> {
    return this.auth.staffLogin(Role.TEACHER, dto.identifier, dto.password, req.ip ?? null);
  }

  @Public()
  @Throttle(LOGIN_THROTTLE)
  @Post('student-login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Student sign-in: Full Name + Student ID only' })
  studentLogin(@Body() dto: StudentLoginDto, @Req() req: Request): Promise<LoginResponse> {
    return this.auth.studentLogin(dto, req.ip ?? null);
  }

  @Post('change-password')
  @Roles(Role.CLASS_MASTER, Role.TEACHER)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change your own password (Class Master / Teacher). Other sessions are signed out.' })
  changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto): Promise<LoginResponse> {
    return this.auth.changePassword(user, dto);
  }
}
