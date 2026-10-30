import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppSettings } from '../settings/settings.entity';
import { SettingsModule } from '../settings/settings.module';
import { UsersModule } from '../users/users.module';
import { SetupController } from './setup.controller';
import { SetupService } from './setup.service';

@Module({
  imports: [TypeOrmModule.forFeature([AppSettings]), UsersModule, SettingsModule],
  controllers: [SetupController],
  providers: [SetupService],
})
export class SetupModule {}
