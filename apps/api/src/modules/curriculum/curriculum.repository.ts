import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

@Injectable()
export class CurriculumRepository {
  constructor(private readonly prisma: PrismaService) {}
  list() {
    return this.prisma.skill.findMany({
      orderBy: { displayOrder: 'asc' },
      include: { criterions: { orderBy: { displayOrder: 'asc' } } },
    });
  }
}
