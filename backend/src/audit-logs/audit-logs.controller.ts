import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { Paginated } from '../common/pagination/pagination.util';
import { AuditLogsService } from './audit-logs.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { AuditLogView } from './types/audit-log.types.interface';

@ApiTags('audit-logs')
@ApiBearerAuth()
@Roles(Role.CLASS_MASTER)
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogs: AuditLogsService) {}

  @Get()
  @ApiOperation({ summary: 'Browse the audit trail (Class Master only)' })
  findAll(@Query() query: AuditLogQueryDto): Promise<Paginated<AuditLogView>> {
    return this.auditLogs.findAll(query);
  }
}
