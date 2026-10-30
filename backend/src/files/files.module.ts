import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { loadAppConfig } from '../config/app.config';
import { FilesController } from './files.controller';
import { FileRecord } from './files.entity';
import { FilesService } from './files.service';
import { StorageService } from './storage.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([FileRecord]),
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // Memory storage: the service validates the bytes before anything touches the disk.
        limits: { fileSize: loadAppConfig(config).maxUploadBytes, files: 1 },
      }),
    }),
  ],
  controllers: [FilesController],
  providers: [FilesService, StorageService],
  exports: [FilesService, StorageService],
})
export class FilesModule {}
