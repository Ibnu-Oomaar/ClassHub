import { Controller, Get, Header, Query, StreamableFile } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import {
  AssignmentReportQueryDto,
  ExaminationReportQueryDto,
  PeriodReportQueryDto,
  ReportFormatQueryDto,
  StudentReportQueryDto,
  SubjectReportQueryDto,
} from './dto/report-query.dto';
import { ReportsService } from './reports.service';
import { ReportDocument } from './types/report.types.interface';

type ReportResponse = Promise<ReportDocument | StreamableFile>;

/**
 * Every report accepts `format=json` (default, for the screen), `format=csv` or `format=pdf`.
 * Reports are built from real stored data and never cached.
 */
@ApiTags('reports')
@ApiBearerAuth()
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('examination-results')
  @Header('Cache-Control', 'private, no-store')
  @Roles(Role.CLASS_MASTER)
  @ApiOperation({ summary: 'Ranked results of one published examination (Class Master)' })
  async examinationResults(@Query() query: ExaminationReportQueryDto, @CurrentUser() user: AuthenticatedUser): ReportResponse {
    const document = await this.reports.builders.examinationResults(query.examinationId);
    return this.reports.deliver({ document, format: query.format, actor: user });
  }

  @Get('student-performance')
  @Header('Cache-Control', 'private, no-store')
  @Roles(Role.CLASS_MASTER)
  @ApiOperation({ summary: 'One student across all published examinations (Class Master)' })
  async studentPerformance(@Query() query: StudentReportQueryDto, @CurrentUser() user: AuthenticatedUser): ReportResponse {
    const document = await this.reports.builders.studentPerformance(query.studentId);
    return this.reports.deliver({ document, format: query.format, actor: user });
  }

  @Get('my-performance')
  @Header('Cache-Control', 'private, no-store')
  @Roles(Role.STUDENT)
  @ApiOperation({ summary: 'My own published results across all examinations (Student)' })
  async myPerformance(@Query() query: ReportFormatQueryDto, @CurrentUser() user: AuthenticatedUser): ReportResponse {
    const document = await this.reports.builders.studentPerformance(user.studentProfileId ?? '');
    return this.reports.deliver({ document, format: query.format, actor: user });
  }

  @Get('subject-performance')
  @Header('Cache-Control', 'private, no-store')
  @Roles(Role.CLASS_MASTER, Role.TEACHER)
  @ApiOperation({ summary: 'One subject across published examinations (Class Master, or a teacher of the subject)' })
  async subjectPerformance(@Query() query: SubjectReportQueryDto, @CurrentUser() user: AuthenticatedUser): ReportResponse {
    const document = await this.reports.builders.subjectPerformance(query.subjectId, query.examinationId, user);
    return this.reports.deliver({ document, format: query.format, actor: user });
  }

  @Get('class-performance')
  @Header('Cache-Control', 'private, no-store')
  @Roles(Role.CLASS_MASTER)
  @ApiOperation({ summary: 'Class averages, pass rates and toppers per examination (Class Master)' })
  async classPerformance(@Query() query: PeriodReportQueryDto, @CurrentUser() user: AuthenticatedUser): ReportResponse {
    const document = await this.reports.builders.classPerformance(query.academicPeriod);
    return this.reports.deliver({ document, format: query.format, actor: user });
  }

  @Get('rankings')
  @Header('Cache-Control', 'private, no-store')
  @Roles(Role.CLASS_MASTER)
  @ApiOperation({ summary: 'Cumulative class ranking by average percentage (Class Master)' })
  async rankings(@Query() query: PeriodReportQueryDto, @CurrentUser() user: AuthenticatedUser): ReportResponse {
    const document = await this.reports.builders.rankings(query.academicPeriod);
    return this.reports.deliver({ document, format: query.format, actor: user });
  }

  @Get('assignment-performance')
  @Header('Cache-Control', 'private, no-store')
  @Roles(Role.CLASS_MASTER, Role.TEACHER)
  @ApiOperation({ summary: 'Submission and grading figures per assignment (Class Master, or a teacher for their subjects)' })
  async assignmentPerformance(@Query() query: AssignmentReportQueryDto, @CurrentUser() user: AuthenticatedUser): ReportResponse {
    const document = await this.reports.builders.assignmentPerformance(query.assignmentId, query.subjectId, user);
    return this.reports.deliver({ document, format: query.format, actor: user });
  }

  @Get('teacher-subjects')
  @Header('Cache-Control', 'private, no-store')
  @Roles(Role.CLASS_MASTER)
  @ApiOperation({ summary: 'Which teacher teaches which subject, and subjects without a teacher (Class Master)' })
  async teacherSubjects(@Query() query: ReportFormatQueryDto, @CurrentUser() user: AuthenticatedUser): ReportResponse {
    const document = await this.reports.builders.teacherSubjectAssignments();
    return this.reports.deliver({ document, format: query.format, actor: user });
  }
}
