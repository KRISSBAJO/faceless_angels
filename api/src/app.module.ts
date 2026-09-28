import { Controller, Get, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminController } from './admin/admin.controller';
import { AdminService } from './admin/admin.service';
import { AuditService } from './audit/audit.service';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { AuthService } from './auth/auth.service';
import { TokensService } from './auth/tokens.service';
import { CasesController } from './cases/cases.controller';
import { CasesService } from './cases/cases.service';
import { CatalogController } from './catalog/catalog.controller';
import { CatalogService } from './catalog/catalog.service';
import { DbService } from './db/db.service';
import { IdentityController } from './identity/identity.controller';
import { IdentityService } from './identity/identity.service';
import { MailService } from './mail/mail.service';
import { NeedsController } from './needs/needs.controller';
import { NeedsService } from './needs/needs.service';
import { PrayerGroupsService } from './prayer/groups.service';
import { PrayerModerationService } from './prayer/moderation.service';
import {
  PrayerController,
  PrayerPublicController,
} from './prayer/prayer.controller';
import { PrayerRequestsService } from './prayer/requests.service';
import { PrayerSessionsService } from './prayer/sessions.service';
import { ReviewController } from './review/review.controller';
import { ReviewService } from './review/review.service';
import { SeedService } from './seed.service';
import { VaultService } from './storage/vault.service';

@Controller('health')
class HealthController {
  constructor(private readonly db: DbService) {}

  @Get()
  async health() {
    await this.db.query('select 1');
    return { ok: true };
  }
}

@Module({
  imports: [
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 120 }] }),
  ],
  controllers: [
    HealthController,
    AuthController,
    CatalogController,
    CasesController,
    IdentityController,
    ReviewController,
    NeedsController,
    PrayerPublicController,
    PrayerController,
    AdminController,
  ],
  providers: [
    DbService,
    AuditService,
    MailService,
    VaultService,
    TokensService,
    AuthService,
    AuthGuard,
    CatalogService,
    CasesService,
    IdentityService,
    ReviewService,
    NeedsService,
    PrayerRequestsService,
    PrayerGroupsService,
    PrayerSessionsService,
    PrayerModerationService,
    AdminService,
    SeedService,
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
