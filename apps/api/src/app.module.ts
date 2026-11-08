import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { databaseConfig } from './common/config/database.config';
import { HealthModule } from './common/health/health.module';
import { PrismaModule } from './common/prisma/prisma.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${process.env.NODE_ENV || 'development'}`, '.env'],
      load: [databaseConfig],
    }),
    PrismaModule,
    HealthModule,
  ],
})
export class AppModule {}

