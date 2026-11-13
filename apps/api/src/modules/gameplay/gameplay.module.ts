import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { LearningContentModule } from '../learning-content/learning-content.module.js';
import { UsersModule } from '../users/users.module.js';
import { GameplayService } from './application/gameplay.service.js';
import { PlaySessionRepository } from './application/play-session.repository.js';
import { PrismaPlaySessionRepository } from './infrastructure/prisma-play-session.repository.js';
import { GameplayController } from './presentation/gameplay.controller.js';

@Module({
  imports: [PrismaModule, LearningContentModule, UsersModule],
  controllers: [GameplayController],
  providers: [
    GameplayService,
    { provide: PlaySessionRepository, useClass: PrismaPlaySessionRepository },
  ],
})
export class GameplayModule {}
