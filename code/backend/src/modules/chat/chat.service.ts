import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { getSupabaseAdmin } from '../../database/supabase.client.js';

@Injectable()
export class ChatService {
  /**
   * One thread per (listing, buyer) — the schema's unique constraint. Calling
   * this twice returns the same thread instead of failing.
   */
  async startChat(userId: string, listingId: string) {
    const supabase = getSupabaseAdmin();

    const { data: listing, error: listingError } = await supabase
      .from('listings')
      .select('id, owner_id, status')
      .eq('id', listingId)
      .single();

    if (listingError || !listing) throw new NotFoundException('Listing not found');
    if (listing.owner_id === userId) {
      throw new BadRequestException('You cannot start a chat on your own listing');
    }

    const { data: existing } = await supabase
      .from('chats')
      .select('id, listing_id, initiator_id, owner_id, created_at')
      .eq('listing_id', listingId)
      .eq('initiator_id', userId)
      .maybeSingle();

    if (existing) return existing;

    const { data, error } = await supabase
      .from('chats')
      .insert({ listing_id: listingId, initiator_id: userId, owner_id: listing.owner_id })
      .select('id, listing_id, initiator_id, owner_id, created_at')
      .single();

    if (error || !data) throw new BadRequestException(error?.message ?? 'Could not start chat');
    return data;
  }

  /** Every thread the caller is part of, with the listing and last message. */
  async listChats(userId: string) {
    const supabase = getSupabaseAdmin();

    const { data: chats, error } = await supabase
      .from('chats')
      .select('id, listing_id, initiator_id, owner_id, created_at')
      .or(`initiator_id.eq.${userId},owner_id.eq.${userId}`)
      .order('created_at', { ascending: false });

    if (error) throw new BadRequestException(error.message);
    if (!chats?.length) return [];

    const { data: listings } = await supabase
      .from('listings')
      .select('id, title, images, type, price, rent_amount, rent_unit')
      .in('id', chats.map((c) => c.listing_id));

    const listingById = new Map((listings ?? []).map((l) => [l.id, l]));

    return Promise.all(
      chats.map(async (chat) => {
        const { data: last } = await supabase
          .from('messages')
          .select('content, sent_at, sender_id')
          .eq('chat_id', chat.id)
          .order('sent_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        return {
          ...chat,
          listing: listingById.get(chat.listing_id) ?? null,
          last_message: last ?? null,
        };
      }),
    );
  }

  private async assertParticipant(chatId: string, userId: string) {
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

  async listMessages(chatId: string, userId: string) {
    await this.assertParticipant(chatId, userId);

    const { data, error } = await getSupabaseAdmin()
      .from('messages')
      .select('id, chat_id, sender_id, content, sent_at')
      .eq('chat_id', chatId)
      .order('sent_at', { ascending: true })
      .limit(200);

    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  async sendMessage(chatId: string, userId: string, content: string) {
    await this.assertParticipant(chatId, userId);

    const { data, error } = await getSupabaseAdmin()
      .from('messages')
      .insert({ chat_id: chatId, sender_id: userId, content })
      .select('id, chat_id, sender_id, content, sent_at')
      .single();

    if (error || !data) throw new BadRequestException(error?.message ?? 'Could not send message');
    return data;
  }
}
