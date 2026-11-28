import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/** Append-only trail of sensitive actions. Callers pass what happened; nothing is read or changed here. */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: {
    actorUserId: string;
    action: string;
    targetType: string;
    targetId: string;
    detail?: Prisma.InputJsonObject;
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorUserId: input.actorUserId,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId,
        ...(input.detail ? { detail: input.detail } : {}),
      },
    });
  }
}
