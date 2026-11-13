import { Controller, Get } from '@nestjs/common';
import { Permissions } from '../auth/decorators/auth.decorators.js';
import { CurriculumService } from './curriculum.service.js';

@Controller('curriculum')
export class CurriculumController {
  constructor(private readonly curriculum: CurriculumService) {}
  @Get('skills')
  @Permissions('READ_GAMES')
  list() {
    return this.curriculum.list();
  }
}
