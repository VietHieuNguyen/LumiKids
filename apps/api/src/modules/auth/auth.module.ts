import { AuditModule } from '../audit/audit.module.js';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import type { ConfigType } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';
import authConfig from '../../common/config/auth.config.js';
import childAuthConfig from '../../common/config/child-auth.config.js';
import verificationConfig from '../../common/config/verification.config.js';
import mailConfig from '../../common/config/mail.config.js';
import { MailService } from '../../common/mail/mail.service.js';
import { RegistrationRepository } from './registration.repository.js';
import { RegistrationService } from './registration.service.js';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AdminTeacherAccountsController } from './admin-teacher-accounts.controller.js';
import { AdminGuardianAccountsController } from './admin-guardian-accounts.controller.js';
import { AccountProfileController } from './account-profile.controller.js';
import { AccountProfileRepository } from './account-profile.repository.js';
import { AccountProfileService } from './account-profile.service.js';
import { GuardianAccountsRepository } from './guardian-accounts.repository.js';
import { AccountStatusRepository } from './account-status.repository.js';
import { GuardianAccountsService } from './guardian-accounts.service.js';
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
    AuditModule,
    ConfigModule.forFeature(authConfig),
    ConfigModule.forFeature(childAuthConfig),
    ConfigModule.forFeature(verificationConfig),
    ConfigModule.forFeature(mailConfig),
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
    AdminGuardianAccountsController,
    AccountProfileController,
  ],
  providers: [
    AuthService,
    PasswordService,
    AuthSessionsRepository,
    ChildAuthService,
    ChildAuthRepository,
    TeacherAccountsService,
    TeacherAccountsRepository,
    GuardianAccountsService,
    GuardianAccountsRepository,
    AccountStatusRepository,
    AccountProfileService,
    AccountProfileRepository,
    RegistrationService,
    MailService,
    RegistrationRepository,
    BrowserRequestGuard,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  // Classrooms issue login codes through the service that owns the code secret.
  exports: [ChildAuthService],
})
export class AuthModule {}
