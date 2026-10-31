import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface';
import { Paginated } from '../common/pagination/pagination.util';
import { CreateMarkDto } from './dto/create-mark.dto';
import { ConfirmMarkImportDto } from './dto/confirm-mark-import.dto';
import { MarksQueueQueryDto } from './dto/marks-queue-query.dto';
import { ReviewMarksDto } from './dto/review-marks.dto';
import { SaveMarksDto } from './dto/save-marks.dto';
import { SubmitMarksDto } from './dto/submit-marks.dto';
import { UpdateMarkDto } from './dto/update-mark.dto';
import { MarksService } from './marks.service';
import { MarkEntryView, MarkSheetView, MarksQueueItem } from './types/mark.types.interface';

const MARKS_IMPORT_MAX_BYTES = Number(process.env.MAX_UPLOAD_MB ?? '10') * 1024 * 1024;

/**
 * Marks workflow: teachers enter and submit, the Class Master approves or rejects.
 * Students have no access here; they only ever see published results (see the results feature).
 */
@ApiTags('marks')
@ApiBearerAuth()
@Controller('marks')
export class MarksController {
  constructor(private readonly marks: MarksService) {}

  @Get('queue')
  @Roles(Role.CLASS_MASTER, Role.TEACHER)
  @ApiOperation({
    summary: 'Mark sheets to work on',
    description: 'Class Master: sheets waiting for review (default). Teacher: their own sheets, filterable by status.',
  })
  queue(@Query() query: MarksQueueQueryDto, @CurrentUser() user: AuthenticatedUser): Promise<Paginated<MarksQueueItem>> {
    return this.marks.queue(query, user);
  }

  @Get('examination-subjects/:id')
  @Roles(Role.CLASS_MASTER, Role.TEACHER)
  @ApiOperation({ summary: 'The mark sheet of one subject in one examination (teachers: assigned subjects only)' })
  getSheet(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<MarkSheetView> {
    return this.marks.getSheet(id, user);
  }

  @Put('examination-subjects/:id')
  @Roles(Role.TEACHER)
  @ApiOperation({ summary: 'Save, change or clear many marks at once (Teacher, while the sheet is editable)' })
  saveEntries(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SaveMarksDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MarkSheetView> {
    return this.marks.saveEntries(id, dto, user);
  }

  @Post('examination-subjects/:id/import-preview')
  @Roles(Role.TEACHER)
  @ApiOperation({ summary: 'Validate and preview marks from a PDF, .xlsx, or CSV document' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file'], properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MARKS_IMPORT_MAX_BYTES, files: 1 } }))
  previewImport(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.marks.previewImport(id, file, user);
  }

  @Post('examination-subjects/:id/import-confirm')
  @HttpCode(200)
  @Roles(Role.TEACHER)
  @ApiOperation({ summary: 'Confirm validated marks and atomically save only their scores' })
  confirmImport(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmMarkImportDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MarkSheetView> {
    return this.marks.confirmImport(id, dto, user);
  }

  @Post('examination-subjects/:id/submit')
  @HttpCode(200)
  @Roles(Role.TEACHER)
  @ApiOperation({ summary: 'Submit the marks to the Class Master. Locks the sheet until it is reviewed.' })
  submit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() _dto: SubmitMarksDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MarkSheetView> {
    return this.marks.submit(id, user);
  }

  @Post('examination-subjects/:id/review')
  @HttpCode(200)
  @Roles(Role.CLASS_MASTER)
  @ApiOperation({ summary: 'Approve or reject submitted marks (Class Master only). Rejecting needs feedback.' })
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReviewMarksDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MarkSheetView> {
    return this.marks.review(id, dto, user);
  }

  @Post()
  @Roles(Role.TEACHER)
  @ApiOperation({ summary: 'Enter the mark of one student (Teacher)' })
  create(@Body() dto: CreateMarkDto, @CurrentUser() user: AuthenticatedUser): Promise<MarkEntryView> {
    return this.marks.createMark(dto, user);
  }

  @Patch(':id')
  @Roles(Role.TEACHER)
  @ApiOperation({ summary: 'Change one mark (Teacher, before submission or after rejection)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateMarkDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<MarkEntryView> {
    return this.marks.updateMark(id, dto, user);
  }

  @Delete(':id')
  @Roles(Role.TEACHER)
  @ApiOperation({ summary: 'Clear one mark (Teacher, before submission or after rejection)' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthenticatedUser): Promise<{ deleted: true }> {
    return this.marks.deleteMark(id, user);
  }
}
