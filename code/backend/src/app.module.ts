import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { rateLimitOptions } from './common/security/rate-limit.js';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { supabaseConfig } from './config/supabase.config.js';
import { ProfileModule } from './modules/profile/profile.module.js';
import { ListingsModule } from './modules/listings/listings.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { ChatModule } from './modules/chat/chat.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { TransactionsModule } from './modules/transactions/transactions.module.js';
import { CampusModule } from './modules/campus/campus.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [supabaseConfig] }),
    // Rate limits on every route (common/security/rate-limit.ts).
    ThrottlerModule.forRoot(rateLimitOptions),
    ProfileModule,
    ListingsModule,
    AdminModule,
    ChatModule,
    NotificationsModule,
    TransactionsModule,
    CampusModule,
    ReportsModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
