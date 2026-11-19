import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { Permissions } from '../auth/decorators/auth.decorators.js';
import { AssignmentsService } from './assignments.service.js';

/** School administration, read-only: what teachers assigned to a class and how children did. */
@Controller('admin/classrooms/:classId/assignments')
@Permissions('MANAGE_CLASSROOMS')
export class AdminAssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Get()
  list(@Param('classId', ParseUUIDPipe) classId: string) {
    return this.assignments.adminList(classId);
  }
  @Get(':assignmentId')
  detail(
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('assignmentId', ParseUUIDPipe) assignmentId: string,
  ) {
    return this.assignments.adminDetail(classId, assignmentId);
  }
}
