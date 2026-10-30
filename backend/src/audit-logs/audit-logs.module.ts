import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditLogsController } from './audit-logs.controller';
import { AuditLog } from './audit-logs.entity';
import { AuditLogsService } from './audit-logs.service';

/** Global so any feature can record audit events without re-importing the module. */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  controllers: [AuditLogsController],
  providers: [AuditLogsService],
  exports: [AuditLogsService],
})
export class AuditLogsModule {}
