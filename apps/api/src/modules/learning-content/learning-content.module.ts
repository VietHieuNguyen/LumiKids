import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { ClassroomsModule } from '../classrooms/classrooms.module.js';
import { CurriculumModule } from '../curriculum/curriculum.module.js';
import { GameAssetModule } from '../game-assets/game-asset.module.js';
import { GameGenerationModule } from '../game-generation/game-generation.module.js';
import { GameLibraryController } from './game-library.controller.js';
import { GameLibraryRepository } from './game-library.repository.js';
import { GameLibraryService } from './game-library.service.js';
import { PlayableGameService } from './playable-game.service.js';
import { AssignmentsRepository } from './assignments.repository.js';
import { AssignmentsService } from './assignments.service.js';
import { TeacherAssignmentsController } from './teacher-assignments.controller.js';

@Module({
  imports: [
    PrismaModule,
    CurriculumModule,
    GameAssetModule,
    GameGenerationModule,
    ClassroomsModule,
  ],
  controllers: [GameLibraryController, TeacherAssignmentsController],
  providers: [
    GameLibraryRepository,
    GameLibraryService,
    PlayableGameService,
    AssignmentsRepository,
    AssignmentsService,
  ],
  exports: [PlayableGameService, AssignmentsService],
})
export class LearningContentModule {}
