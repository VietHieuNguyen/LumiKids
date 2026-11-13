import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import appConfig from './common/config/app.config.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { GameAssetModule } from './modules/game-assets/game-asset.module.js';
import { GameGenerationModule } from './modules/game-generation/game-generation.module.js';
import { CurriculumModule } from './modules/curriculum/curriculum.module.js';
import { LearningContentModule } from './modules/learning-content/learning-content.module.js';
import { apiEnvFiles } from './common/config/env-files.js';
import {
  ApiExceptionFilter,
  ApiResponseInterceptor,
} from './common/http/api-response.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: apiEnvFiles(),
      load: [appConfig],
    }),
    PrismaModule,
    AuthModule,
    GameAssetModule,
    GameGenerationModule,
    CurriculumModule,
    LearningContentModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: ApiResponseInterceptor },
  ],
})
export class AppModule {}
