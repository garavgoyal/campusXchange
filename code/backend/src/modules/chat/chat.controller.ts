import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import {
  SupabaseAuthGuard,
  type AuthedUser,
} from '../../common/guards/supabase-auth.guard.js';
import { VerifiedStudentGuard } from '../../common/guards/verified-student.guard.js';
import { SendMessageDto, StartChatDto } from './dto/chat.dto.js';
import { CreateOfferDto } from './dto/offer.dto.js';
import { ChatService } from './chat.service.js';
import { OffersService } from './offers.service.js';

/**
 * Reading your own threads only needs a session; every action that talks to
 * another student (start, message, offer, respond) needs a verified ID.
 */
@Controller('chats')
export class ChatController {
  constructor(
    private readonly chatService: ChatService,
    private readonly offersService: OffersService,
  ) {}

  @Get()
  @UseGuards(SupabaseAuthGuard)
  listChats(@CurrentUser() user: AuthedUser) {
    return this.chatService.listChats(user.id);
  }

  @Post()
  @UseGuards(VerifiedStudentGuard)
  startChat(@Body() dto: StartChatDto, @CurrentUser() user: AuthedUser) {
    return this.chatService.startChat(user.id, dto.listing_id);
  }

  @Get(':chatId/messages')
  @UseGuards(SupabaseAuthGuard)
  listMessages(@Param('chatId') chatId: string, @CurrentUser() user: AuthedUser) {
    return this.chatService.listMessages(chatId, user.id);
  }

  @Post(':chatId/messages')
  @UseGuards(VerifiedStudentGuard)
  sendMessage(
    @Param('chatId') chatId: string,
    @Body() dto: SendMessageDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.chatService.sendMessage(chatId, user.id, dto.content);
  }

  // ---- negotiation ----

  @Get(':chatId/offers')
  @UseGuards(SupabaseAuthGuard)
  listOffers(@Param('chatId') chatId: string, @CurrentUser() user: AuthedUser) {
    return this.offersService.listOffers(chatId, user.id);
  }

  @Post(':chatId/offers')
  @UseGuards(VerifiedStudentGuard)
  createOffer(
    @Param('chatId') chatId: string,
    @Body() dto: CreateOfferDto,
    @CurrentUser() user: AuthedUser,
  ) {
    return this.offersService.createOffer(chatId, user.id, dto.offered_price);
  }

  @Post('offers/:offerId/accept')
  @UseGuards(VerifiedStudentGuard)
  acceptOffer(@Param('offerId') offerId: string, @CurrentUser() user: AuthedUser) {
    return this.offersService.decideOffer(offerId, user.id, 'accepted');
  }

  @Post('offers/:offerId/reject')
  @UseGuards(VerifiedStudentGuard)
  rejectOffer(@Param('offerId') offerId: string, @CurrentUser() user: AuthedUser) {
    return this.offersService.decideOffer(offerId, user.id, 'rejected');
  }
}
