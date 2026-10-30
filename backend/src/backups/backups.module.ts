import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { TypeOrmModule } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { diskStorage } from 'multer';
import { loadAppConfig } from '../config/app.config';
import { FilesModule } from '../files/files.module';
import { User } from '../users/users.entity';
import { BackupsController } from './backups.controller';
import { Backup } from './backups.entity';
import { BackupsService } from './backups.service';
import { MaintenanceMiddleware } from './maintenance.middleware';
import { MaintenanceState } from './maintenance.state';

@Module({
  imports: [
    TypeOrmModule.forFeature([Backup, User]),
    FilesModule,
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const app = loadAppConfig(config);
        return {
          // Backups can be large, so they are streamed straight to disk instead of held in memory.
          storage: diskStorage({
            destination: join(app.storagePath, 'backups'),
            filename: (_request, _file, callback) => callback(null, `${randomUUID()}.upload`),
          }),
          limits: { fileSize: app.maxBackupUploadBytes, files: 1 },
        };
      },
    }),
  ],
  controllers: [BackupsController],
  providers: [BackupsService, MaintenanceState, MaintenanceMiddleware],
})
export class BackupsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(MaintenanceMiddleware).forRoutes({ path: '{*splat}', method: RequestMethod.ALL });
  }
}
