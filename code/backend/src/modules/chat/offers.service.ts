import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { getSupabaseAdmin } from '../../database/supabase.client.js';

const OFFER_COLUMNS = 'id, chat_id, sender_id, offered_price, status, created_at';

/**
 * Price negotiation inside a chat thread. Deliberately stops at "both sides
 * agreed on a number" — no transaction row, no escrow, no payment.
 */
@Injectable()
export class OffersService {
  private async loadChat(chatId: string, userId: string) {
    const { data, error } = await getSupabaseAdmin()
      .from('chats')
      .select('id, initiator_id, owner_id, listing_id')
      .eq('id', chatId)
      .single();

    if (error || !data) throw new NotFoundException('Chat not found');
    if (data.initiator_id !== userId && data.owner_id !== userId) {
      throw new ForbiddenException('Not your conversation');
    }
    return data;
  }

  async listOffers(chatId: string, userId: string) {
    await this.loadChat(chatId, userId);

    const { data, error } = await getSupabaseAdmin()
      .from('offers')
      .select(OFFER_COLUMNS)
      .eq('chat_id', chatId)
      .order('created_at', { ascending: true });

    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  /** Either party may propose a price — that's what makes it a negotiation. */
  async createOffer(chatId: string, userId: string, price: number) {
    await this.loadChat(chatId, userId);

    const { data: agreed } = await getSupabaseAdmin()
      .from('offers')
      .select('id')
      .eq('chat_id', chatId)
      .eq('status', 'accepted')
      .maybeSingle();

    if (agreed) {
      throw new BadRequestException('A price has already been agreed in this chat');
    }

    const { data, error } = await getSupabaseAdmin()
      .from('offers')
      .insert({ chat_id: chatId, sender_id: userId, offered_price: price, status: 'pending' })
      .select(OFFER_COLUMNS)
      .single();

    if (error || !data) throw new BadRequestException(error?.message ?? 'Could not send offer');
    return data;
  }

  /**
   * Only the party who did NOT make the offer can accept or reject it.
   * Accepting settles the thread: every other pending offer is closed out.
   */
  async decideOffer(offerId: string, userId: string, decision: 'accepted' | 'rejected') {
    const supabase = getSupabaseAdmin();

    const { data: offer, error } = await supabase
      .from('offers')
      .select(OFFER_COLUMNS)
      .eq('id', offerId)
      .single();

    if (error || !offer) throw new NotFoundException('Offer not found');
    await this.loadChat(offer.chat_id, userId);

    if (offer.sender_id === userId) {
      throw new BadRequestException('You cannot respond to your own offer');
    }
    if (offer.status !== 'pending') {
      throw new BadRequestException(`That offer was already ${offer.status}`);
    }

    const { data: updated, error: updateError } = await supabase
      .from('offers')
      .update({ status: decision })
      .eq('id', offerId)
      .eq('status', 'pending')
      .select(OFFER_COLUMNS)
      .single();

    if (updateError || !updated) {
      throw new BadRequestException(updateError?.message ?? 'Could not save that decision');
    }

    if (decision === 'accepted') {
      await supabase
        .from('offers')
        .update({ status: 'rejected' })
        .eq('chat_id', offer.chat_id)
        .eq('status', 'pending')
        .neq('id', offerId);
    }

    return updated;
  }
}
