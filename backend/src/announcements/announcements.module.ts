import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AnnouncementsController } from './announcements.controller';
import { Announcement } from './announcements.entity';
import { AnnouncementsService } from './announcements.service';

@Module({
  imports: [TypeOrmModule.forFeature([Announcement])],
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService],
  exports: [AnnouncementsService, TypeOrmModule],
})
export class AnnouncementsModule {}
