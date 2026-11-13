import { BadRequestException, Injectable } from '@nestjs/common';
import { curriculumSchema } from '@lumikids/shared';
import { CurriculumRepository } from './curriculum.repository.js';

@Injectable()
export class CurriculumService {
  constructor(private readonly repository: CurriculumRepository) {}
  async list() {
    return curriculumSchema.parse(await this.repository.list());
  }
  async requireCodes(codes: string[]) {
    const catalog = await this.list();
    const available = new Set(
      catalog.flatMap((skill) => skill.criterions.map((c) => c.criterionCode)),
    );
    if (!codes.length || codes.some((code) => !available.has(code)))
      throw new BadRequestException(
        'Chỉ số đã chọn không có trong danh mục hiện hành.',
      );
  }
}
