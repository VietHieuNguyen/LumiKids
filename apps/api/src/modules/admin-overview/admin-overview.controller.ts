import { Controller, Get, Header } from '@nestjs/common';
import { Permissions } from '../auth/decorators/auth.decorators.js';
import { AdminOverviewService } from './admin-overview.service.js';

@Controller('admin/overview')
@Permissions('MANAGE_CLASSROOMS')
export class AdminOverviewController {
  constructor(private readonly overview: AdminOverviewService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  get() {
    return this.overview.overview();
  }
}
