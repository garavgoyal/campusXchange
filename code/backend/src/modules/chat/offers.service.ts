import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { getSupabaseAdmin } from '../../database/supabase.client.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { CreateOfferDto } from './dto/offer.dto.js';
import { requireOwnImageUrls } from '../../common/uploads/own-image-urls.js';

const OFFER_COLUMNS =
  'id, chat_id, sender_id, offered_price, status, created_at, item_title, item_description, item_images, topup_payer';

type LiveListing = { title: string; type: 'sell' | 'lend' | 'exchange'; rent_unit: string | null };

/**
 * Price negotiation inside a chat thread. Ends at "both sides agreed on a
 * number"; the seller then turns that agreement into a deal (POST /transactions).
 */
@Injectable()
export class OffersService {
  constructor(private readonly notifications: NotificationsService) {}

  private other(chat: { initiator_id: string; owner_id: string }, userId: string) {
    return chat.initiator_id === userId ? chat.owner_id : chat.initiator_id;
  }

  /** Negotiating only makes sense while the item is still on the feed. */
  private async assertListingLive(listingId: string): Promise<LiveListing> {
    const { data } = await getSupabaseAdmin()
      .from('listings')
      .select('status, title, type, rent_unit')
      .eq('id', listingId)
      .maybeSingle();
    if (!data || data.status !== 'live') {
      throw new BadRequestException('This item is no longer available for negotiation');
    }
    return data as LiveListing;
  }

  /**
   * Exchange offers carry an item. The person asking to swap must describe and
   * photograph theirs; when the listing owner counters, the item is copied from
   * the latest item offer in the thread and only the top-up changes.
   */
  private async exchangeFields(
    chat: { id: string; owner_id: string },
    userId: string,
    dto: CreateOfferDto,
  ) {
    const price = Number(dto.offered_price);
    if (price > 0 && !dto.topup_payer) {
      throw new BadRequestException('Say who adds the top-up money');
    }
    const topup_payer = price > 0 ? dto.topup_payer! : null;

    if (userId !== chat.owner_id) {
      const title = dto.item_title?.trim() ?? '';
      const images = (dto.item_images ?? []).filter((u) => typeof u === 'string' && u.length > 0);
      if (title.length < 3) throw new BadRequestException('Name the item you are offering in exchange');
      if (!images.length) throw new BadRequestException('Add at least one photo of the item you are offering');
      requireOwnImageUrls(images, userId, 'Photos of your item');
      return {
        item_title: title,
        item_description: dto.item_description?.trim() || null,
        item_images: images,
        topup_payer,
      };
    }

    const { data: last } = await getSupabaseAdmin()
      .from('offers')
      .select('item_title, item_description, item_images')
      .eq('chat_id', chat.id)
      .not('item_title', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!last) {
      throw new BadRequestException('Wait for them to offer an item first — then you can counter the top-up');
    }
    return { ...last, topup_payer };
  }

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
  async createOffer(chatId: string, userId: string, dto: CreateOfferDto) {
    const chat = await this.loadChat(chatId, userId);
    const listing = await this.assertListingLive(chat.listing_id);
    const title = listing.title;
    const price = Number(dto.offered_price);

    const { data: agreed } = await getSupabaseAdmin()
      .from('offers')
      .select('id')
      .eq('chat_id', chatId)
      .eq('status', 'accepted')
      .maybeSingle();

    if (agreed) {
      throw new BadRequestException('A price has already been agreed in this chat');
    }

    const extra = listing.type === 'exchange' ? await this.exchangeFields(chat, userId, dto) : {};

    const { data, error } = await getSupabaseAdmin()
      .from('offers')
      .insert({ chat_id: chatId, sender_id: userId, offered_price: price, status: 'pending', ...extra })
      .select(OFFER_COLUMNS)
      .single();

    if (error || !data) throw new BadRequestException(error?.message ?? 'Could not send offer');

    const summary =
      listing.type === 'exchange'
        ? `Swap offered: ${(data as { item_title?: string }).item_title}${price > 0 ? ` + ₹${price} top-up` : ''}.`
        : listing.type === 'lend'
          ? `₹${price} per ${listing.rent_unit ?? 'day'} proposed.`
          : `₹${price} proposed.`;
    await this.notifications.notify(this.other(chat, userId), 'new_offer', {
      title: `New offer · ${title}`,
      body: `${summary} Accept, counter or decline in the chat.`,
      chat_id: chatId,
      listing_id: chat.listing_id,
    });
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
    const chat = await this.loadChat(offer.chat_id, userId);

    if (offer.sender_id === userId) {
      throw new BadRequestException('You cannot respond to your own offer');
    }
    if (offer.status !== 'pending') {
      throw new BadRequestException(`That offer was already ${offer.status}`);
    }
    const title = decision === 'accepted' ? (await this.assertListingLive(chat.listing_id)).title : null;

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

    if (offer.sender_id) {
      await this.notifications.notify(
        offer.sender_id,
        decision === 'accepted' ? 'offer_accepted' : 'offer_rejected',
        decision === 'accepted'
          ? {
              title: 'Offer accepted',
              body: `${offer.item_title ? 'Swap' : `₹${offer.offered_price}`} agreed${title ? ` for "${title}"` : ''}. The listing owner can now finalise the deal.`,
              chat_id: offer.chat_id,
            }
          : {
              title: 'Offer declined',
              body: offer.item_title
                ? `Your swap offer (${offer.item_title}) was declined.`
                : `Your ₹${offer.offered_price} offer was declined.`,
              chat_id: offer.chat_id,
            },
      );
    }

    return updated;
  }
}
