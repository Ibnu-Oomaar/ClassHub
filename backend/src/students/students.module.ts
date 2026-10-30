import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FilesModule } from '../files/files.module';
import { SettingsModule } from '../settings/settings.module';
import { UsersModule } from '../users/users.module';
import { StudentsController } from './students.controller';
import { Student } from './students.entity';
import { StudentsService } from './students.service';

@Module({
  imports: [TypeOrmModule.forFeature([Student]), UsersModule, FilesModule, SettingsModule],
  controllers: [StudentsController],
  providers: [StudentsService],
  exports: [StudentsService, TypeOrmModule],
})
export class StudentsModule {}
