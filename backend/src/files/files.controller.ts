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
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { Paginated } from '../common/pagination/pagination.util';
import { FileQueryDto } from './dto/file-query.dto';
import { UploadFileDto } from './dto/upload-file.dto';
import { FilesService } from './files.service';
import { FileView } from './types/file.types.interface';

@ApiTags('files')
@ApiBearerAuth()
@Controller('files')
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Post('upload')
  @Roles(Role.CLASS_MASTER, Role.TEACHER, Role.STUDENT)
  @HttpCode(201)
  @ApiOperation({
    summary: 'Upload a file, then link its id from the owning record',
    description:
      'The category decides who may upload: PROFILE_PHOTO (Class Master), ASSIGNMENT_ATTACHMENT (Teacher), SUBMISSION (Student). ' +
      'Type is verified from the file extension and content; size limits come from the server configuration.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'category'],
      properties: {
        file: { type: 'string', format: 'binary' },
        category: { type: 'string', enum: ['PROFILE_PHOTO', 'ASSIGNMENT_ATTACHMENT', 'SUBMISSION'] },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadFileDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<FileView> {
    return this.files.upload(file, dto.category, user);
  }

  @Get()
  @Roles(Role.CLASS_MASTER)
  @ApiOperation({ summary: 'List stored files (Class Master only)' })
  findAll(@Query() query: FileQueryDto): Promise<Paginated<FileView>> {
    return this.files.findAll(query);
  }

  @Get(':id')
  @Roles(Role.CLASS_MASTER)
  @ApiOperation({ summary: 'File metadata (Class Master only)' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<FileView> {
    return this.files.findOneView(id);
  }

  @Get(':id/download')
  @Roles(Role.CLASS_MASTER)
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Download any stored file (Class Master only)' })
  async download(@Param('id', ParseUUIDPipe) id: string): Promise<StreamableFile> {
    const record = await this.files.getRecord(id);
    return this.files.stream(record);
  }

  @Delete(':id')
  @Roles(Role.CLASS_MASTER)
  @ApiOperation({ summary: 'Delete an unattached file (Class Master only)' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<{ deleted: true }> {
    await this.files.removeStandalone(id, user);
    return { deleted: true };
  }
}
