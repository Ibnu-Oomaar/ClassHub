import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AnnouncementsModule } from './announcements/announcements.module';
import { AssignmentsModule } from './assignments/assignments.module';
import { AuditLogsModule } from './audit-logs/audit-logs.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { BackupsModule } from './backups/backups.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { validateEnvironment } from './config/environment.validation';
import { DashboardModule } from './dashboard/dashboard.module';
import { DatabaseModule } from './database/database.module';
import { ExaminationsModule } from './examinations/examinations.module';
import { FilesModule } from './files/files.module';
import { GradingModule } from './grading/grading.module';
import { MarksModule } from './marks/marks.module';
import { ReportsModule } from './reports/reports.module';
import { ResultsModule } from './results/results.module';
import { SettingsModule } from './settings/settings.module';
import { SetupModule } from './setup/setup.module';
import { StudentsModule } from './students/students.module';
import { SubjectsModule } from './subjects/subjects.module';
import { SubmissionsModule } from './submissions/submissions.module';
import { TeacherSubjectsModule } from './teacher-subjects/teacher-subjects.module';
import { TeachersModule } from './teachers/teachers.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnvironment, cache: true }),
    // Baseline limit for every route: 120 requests / minute / IP. Login and setup routes are stricter.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 120 }]),
    DatabaseModule,
    AuditLogsModule,
    SettingsModule,
    UsersModule,
    FilesModule,
    StudentsModule,
    TeachersModule,
    SubjectsModule,
    TeacherSubjectsModule,
    AssignmentsModule,
    SubmissionsModule,
    AnnouncementsModule,
    GradingModule,
    ExaminationsModule,
    MarksModule,
    ResultsModule,
    ReportsModule,
    BackupsModule,
    DashboardModule,
    AuthModule,
    SetupModule,
  ],
  providers: [
    // Guards run in this order: rate limit -> authentication -> role check.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
