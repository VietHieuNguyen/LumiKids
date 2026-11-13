import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { CurriculumModule } from '../curriculum/curriculum.module.js';
import { GameAssetModule } from '../game-assets/game-asset.module.js';
import { GameGenerationModule } from '../game-generation/game-generation.module.js';
import { GameLibraryController } from './game-library.controller.js';
import { GameLibraryRepository } from './game-library.repository.js';
import { GameLibraryService } from './game-library.service.js';

@Module({
  imports: [
    PrismaModule,
    CurriculumModule,
    GameAssetModule,
    GameGenerationModule,
  ],
  controllers: [GameLibraryController],
  providers: [GameLibraryRepository, GameLibraryService],
})
export class LearningContentModule {}
