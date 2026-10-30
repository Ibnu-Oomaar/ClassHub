import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FilesModule } from '../files/files.module';
import { TeacherSubject } from '../teacher-subjects/teacher-subjects.entity';
import { UsersModule } from '../users/users.module';
import { TeachersController } from './teachers.controller';
import { Teacher } from './teachers.entity';
import { TeachersService } from './teachers.service';

@Module({
  imports: [TypeOrmModule.forFeature([Teacher, TeacherSubject]), UsersModule, FilesModule],
  controllers: [TeachersController],
  providers: [TeachersService],
  exports: [TeachersService, TypeOrmModule],
})
export class TeachersModule {}
