import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller.js';
import { ChatService } from './chat.service.js';
import { OffersService } from './offers.service.js';

@Module({
  controllers: [ChatController],
  providers: [ChatService, OffersService],
})
export class ChatModule {}
