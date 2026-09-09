import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { supabaseConfig } from './config/supabase.config.js';
import { ProfileModule } from './modules/profile/profile.module.js';
import { ListingsModule } from './modules/listings/listings.module.js';
import { AdminModule } from './modules/admin/admin.module.js';
import { ChatModule } from './modules/chat/chat.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [supabaseConfig] }),
    ProfileModule,
    ListingsModule,
    AdminModule,
    ChatModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
