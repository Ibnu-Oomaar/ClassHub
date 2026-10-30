import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SettingsController } from './settings.controller';
import { AppSettings } from './settings.entity';
import { SettingsService } from './settings.service';

@Module({
  imports: [TypeOrmModule.forFeature([AppSettings])],
  controllers: [SettingsController],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
