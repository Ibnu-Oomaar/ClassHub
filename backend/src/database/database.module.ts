import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildOrmConfig } from '../../ormconfig';

/**
 * Single place that opens the PostgreSQL connection.
 * Feature entities are registered by their own modules through TypeOrmModule.forFeature([...])
 * and discovered here thanks to `autoLoadEntities: true`.
 */
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => buildOrmConfig(config),
    }),
  ],
})
export class DatabaseModule {}
