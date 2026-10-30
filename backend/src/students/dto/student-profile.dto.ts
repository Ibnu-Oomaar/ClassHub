import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AccountStatus } from '../../common/enums/account-status.enum';
import { Gender } from '../../common/enums/gender.enum';

/** Response model for a full student record (documents the API; the service returns plain objects). */
export class StudentProfileDto {
  @ApiProperty() id: string;
  @ApiProperty() userId: string;
  @ApiProperty() fullName: string;
  @ApiProperty({ example: 'ST-001' }) studentId: string;
  @ApiPropertyOptional({ enum: Gender, nullable: true }) gender: Gender | null;
  @ApiProperty({ enum: AccountStatus }) status: AccountStatus;
  @ApiProperty() hasPhoto: boolean;
  @ApiProperty() registeredAt: Date;
  @ApiPropertyOptional({ nullable: true }) deletedAt: Date | null;
  @ApiPropertyOptional({ nullable: true, example: '2010-05-14' }) dateOfBirth: string | null;
  @ApiPropertyOptional({ nullable: true }) phone: string | null;
  @ApiPropertyOptional({ nullable: true }) email: string | null;
  @ApiPropertyOptional({ nullable: true }) address: string | null;
  @ApiPropertyOptional({ nullable: true }) notes: string | null;
  @ApiPropertyOptional({ nullable: true }) lastLoginAt: Date | null;
  @ApiProperty() updatedAt: Date;
}
