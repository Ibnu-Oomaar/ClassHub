import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { Trim } from '../../common/decorators/trim.decorator';
import { ReportFormat } from '../types/report.types.interface';

/** Every report can be shown on screen (json) or downloaded as a spreadsheet (csv) or document (pdf). */
export class ReportFormatQueryDto {
  @ApiPropertyOptional({ enum: ReportFormat, default: ReportFormat.JSON })
  @IsOptional()
  @IsEnum(ReportFormat)
  format: ReportFormat = ReportFormat.JSON;
}

export class ExaminationReportQueryDto extends ReportFormatQueryDto {
  @ApiProperty({ description: 'An examination whose results are published' })
  @IsUUID()
  examinationId: string;
}

export class StudentReportQueryDto extends ReportFormatQueryDto {
  @ApiProperty()
  @IsUUID()
  studentId: string;
}

export class SubjectReportQueryDto extends ReportFormatQueryDto {
  @ApiProperty()
  @IsUUID()
  subjectId: string;

  @ApiPropertyOptional({ description: 'Add the student-by-student scores of one published examination' })
  @IsOptional()
  @IsUUID()
  examinationId?: string;
}

export class PeriodReportQueryDto extends ReportFormatQueryDto {
  @ApiPropertyOptional({ example: 'Term 1', description: 'Only examinations of this academic period' })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(60)
  academicPeriod?: string;
}

export class AssignmentReportQueryDto extends ReportFormatQueryDto {
  @ApiPropertyOptional({ description: 'One assignment: adds the student-by-student list' })
  @IsOptional()
  @IsUUID()
  assignmentId?: string;

  @ApiPropertyOptional({ description: 'Only assignments of this subject' })
  @IsOptional()
  @IsUUID()
  subjectId?: string;
}
