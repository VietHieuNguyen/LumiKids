import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import type { ConfigType } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import authConfig from '../../common/config/auth.config.js';
import childAuthConfig from '../../common/config/child-auth.config.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AdminTeacherAccountsController } from './admin-teacher-accounts.controller.js';
import { TeacherAccountsRepository } from './teacher-accounts.repository.js';
import { TeacherAccountsService } from './teacher-accounts.service.js';
import { ChildAuthController } from './child-auth.controller.js';
import { ChildAuthRepository } from './child-auth.repository.js';
import { ChildAuthService } from './child-auth.service.js';
import { AuthService } from './auth.service.js';
import { PasswordService } from './password.service.js';
import { AuthSessionsRepository } from './auth-sessions.repository.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard, PermissionsGuard } from './guards/authorization.guards.js';
import { BrowserRequestGuard } from './guards/browser-request.guard.js';

@Module({
  imports: [
    ConfigModule.forFeature(authConfig),
    ConfigModule.forFeature(childAuthConfig),
    PrismaModule,
    UsersModule,
    JwtModule.register({}),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule.forFeature(authConfig)],
      inject: [authConfig.KEY],
      useFactory: (config: ConfigType<typeof authConfig>) => [
        { ttl: config.rateTtlMs, limit: config.rateLimit },
      ],
    }),
  ],
  controllers: [
    AuthController,
    ChildAuthController,
    AdminTeacherAccountsController,
  ],
  providers: [
    AuthService,
    PasswordService,
    AuthSessionsRepository,
    ChildAuthService,
    ChildAuthRepository,
    TeacherAccountsService,
    TeacherAccountsRepository,
    BrowserRequestGuard,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  // Classrooms issue login codes through the service that owns the code secret.
  exports: [ChildAuthService],
})
export class AuthModule {}
