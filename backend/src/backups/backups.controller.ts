import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { Paginated } from '../common/pagination/pagination.util';
import { BackupsService } from './backups.service';
import { BackupQueryDto, CreateBackupDto, RestoreBackupDto, UploadBackupDto } from './dto/backup.dto';
import { BackupStatusView, BackupView, RestoreOutcome } from './types/backup.types.interface';

/** Heavy operations are limited to a handful per minute per client. */
const HEAVY = { default: { limit: 5, ttl: 60_000 } };

@ApiTags('backups')
@ApiBearerAuth()
@Roles(Role.CLASS_MASTER)
@Controller('backups')
export class BackupsController {
  constructor(private readonly backups: BackupsService) {}

  @Get('status')
  @ApiOperation({ summary: 'Are the PostgreSQL tools available, and how many backups exist (Class Master)' })
  status(): Promise<BackupStatusView> {
    return this.backups.status();
  }

  @Get()
  @ApiOperation({ summary: 'List backups (Class Master)' })
  list(@Query() query: BackupQueryDto): Promise<Paginated<BackupView>> {
    return this.backups.list(query);
  }

  @Post()
  @Throttle(HEAVY)
  @ApiOperation({ summary: 'Create a backup of the database now (Class Master)' })
  create(@Body() dto: CreateBackupDto, @CurrentUser() user: AuthenticatedUser): Promise<BackupView> {
    return this.backups.create(dto, user);
  }

  @Post('upload')
  @Throttle(HEAVY)
  @ApiOperation({ summary: 'Upload a backup file made by CLASSHUB, to restore it later (Class Master)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' }, note: { type: 'string' } } },
  })
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadBackupDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<BackupView> {
    return this.backups.upload(file?.path, file?.originalname, dto, user);
  }

  @Get(':id/download')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Download a backup file (Class Master)' })
  download(@Param('id', ParseUUIDPipe) id: string): Promise<StreamableFile> {
    return this.backups.download(id);
  }

  @Post(':id/restore')
  @HttpCode(200)
  @Throttle(HEAVY)
  @ApiOperation({
    summary: 'Replace ALL current data with this backup (Class Master)',
    description:
      'Needs the Class Master password and the confirmation text RESTORE. A safety backup of the current data is taken first, ' +
      'and the restore runs as one transaction: if anything fails, nothing changes.',
  })
  restore(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RestoreBackupDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<RestoreOutcome> {
    return this.backups.restore(id, dto, user);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a backup file (Class Master)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<{ id: string }> {
    return this.backups.remove(id, user);
  }
}
