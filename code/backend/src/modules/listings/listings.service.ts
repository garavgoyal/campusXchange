import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { getSupabaseAdmin } from '../../database/supabase.client.js';
import type { CreateListingDto } from './dto/create-listing.dto.js';

const LISTING_COLUMNS =
  'id, owner_id, type, title, description, images, category, condition, price, rent_amount, rent_unit, want_tags, meeting_location, status, created_at';

export type ListingRow = Record<string, unknown> & { meeting_location?: string | null };

@Injectable()
export class ListingsService {
  private readonly logger = new Logger(ListingsService.name);

  /**
   * Guests may browse, but never see where a handoff happens — that is the one
   * field a signed-out stranger should not get. Replaced, not just omitted, so
   * the app can render a "Sign in to see" hint in its place.
   */
  private hideLocationForGuests(rows: ListingRow[], isSignedIn: boolean): ListingRow[] {
    if (isSignedIn) return rows;
    return rows.map((row) => ({ ...row, meeting_location: null, location_hidden: true }));
  }

  async findLive(
    params: { type?: string; category?: string; search?: string },
    isSignedIn: boolean,
  ) {
    const supabase = getSupabaseAdmin();
    let query = supabase.from('listings').select(LISTING_COLUMNS).eq('status', 'live');

    if (params.type) query = query.eq('type', params.type);
    if (params.category) query = query.eq('category', params.category);
    if (params.search) {
      const term = `%${params.search}%`;
      query = query.or(`title.ilike.${term},description.ilike.${term}`);
    }

    const { data, error } = await query.order('created_at', { ascending: false }).limit(100);
    if (error) throw new BadRequestException(error.message);

    return this.hideLocationForGuests((data ?? []) as ListingRow[], isSignedIn);
  }

  async findOne(id: string, isSignedIn: boolean) {
    const { data, error } = await getSupabaseAdmin()
      .from('listings')
      .select(LISTING_COLUMNS)
      .eq('id', id)
      .single();

    if (error || !data) throw new NotFoundException('Listing not found');
    if (data.status !== 'live') throw new NotFoundException('Listing not available');

    return this.hideLocationForGuests([data as ListingRow], isSignedIn)[0];
  }

  /** The caller's own listings, at any status, so they can see "pending review". */
  async findMine(userId: string) {
    const { data, error } = await getSupabaseAdmin()
      .from('listings')
      .select(LISTING_COLUMNS)
      .eq('owner_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  /**
   * Removes the caller's own listing.
   *
   * Hard-deletes when nothing references it. If a conversation already exists,
   * the row is marked `removed` instead — `chats.listing_id` cascades on delete,
   * so a hard delete would silently destroy both students' message history.
   */
  async remove(listingId: string, userId: string) {
    const supabase = getSupabaseAdmin();

    const { data: listing, error } = await supabase
      .from('listings')
      .select('id, owner_id')
      .eq('id', listingId)
      .single();

    if (error || !listing) throw new NotFoundException('Listing not found');
    if (listing.owner_id !== userId) {
      throw new ForbiddenException('You can only delete your own listings');
    }

    const { count } = await supabase
      .from('chats')
      .select('id', { count: 'exact', head: true })
      .eq('listing_id', listingId);

    if (count && count > 0) {
      const { error: updateError } = await supabase
        .from('listings')
        .update({ status: 'removed' })
        .eq('id', listingId);
      if (updateError) throw new BadRequestException(updateError.message);
      return { deleted: false, status: 'removed' as const, reason: 'has_conversations' };
    }

    await supabase.from('moderation_queue').delete().eq('listing_id', listingId);
    const { error: deleteError } = await supabase.from('listings').delete().eq('id', listingId);
    if (deleteError) throw new BadRequestException(deleteError.message);

    return { deleted: true };
  }

  /**
   * Uploads one listing photo and returns its public URL. Unlike ID cards, these
   * are meant to be seen by everyone browsing, so the bucket is public and the
   * URL can be stored directly on the row.
   */
  async uploadImage(userId: string, file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');

    const extension = file.originalname?.split('.').pop()?.toLowerCase() || 'jpg';
    const isImage =
      file.mimetype?.startsWith('image/') ||
      ['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp'].includes(extension);

    if (!isImage) throw new BadRequestException('Listing photos must be images');
    if (file.size > 8 * 1024 * 1024) throw new BadRequestException('Image is larger than 8 MB');

    const supabase = getSupabaseAdmin();
    const bucket = process.env.SUPABASE_LISTING_IMAGE_BUCKET ?? 'listing-images';
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;

    const { error } = await supabase.storage.from(bucket).upload(path, file.buffer, {
      contentType: file.mimetype?.startsWith('image/')
        ? file.mimetype
        : `image/${extension === 'jpg' ? 'jpeg' : extension}`,
      upsert: false,
    });

    if (error) {
      this.logger.error(`Listing image upload failed for ${userId}: ${error.message}`);
      throw new BadRequestException(`Upload failed: ${error.message}`);
    }

    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return { url: data.publicUrl, path };
  }

  /**
   * Creates the listing as `pending_review` and enqueues it for moderation, per
   * the proposal (Section 4.2). Nothing a student posts goes live directly.
   * ai_flag_score stays null — moderation is human-only, as Section 5.1 states.
   */
  async create(userId: string, dto: CreateListingDto) {
    const supabase = getSupabaseAdmin();

    if (dto.type === 'sell' && dto.price == null) {
      throw new BadRequestException('A sell listing needs a price');
    }
    if (dto.type === 'lend' && dto.rent_amount == null) {
      throw new BadRequestException('A lend listing needs a rent amount');
    }
    if (dto.type === 'exchange' && !dto.want_tags?.length) {
      throw new BadRequestException('An exchange listing needs at least one want tag');
    }

    const { data: listing, error } = await supabase
      .from('listings')
      .insert({
        owner_id: userId,
        type: dto.type,
        title: dto.title,
        description: dto.description ?? null,
        images: dto.images ?? [],
        category: dto.category,
        condition: dto.condition ?? null,
        price: dto.type === 'sell' ? dto.price : null,
        rent_amount: dto.type === 'lend' ? dto.rent_amount : null,
        rent_unit: dto.type === 'lend' ? (dto.rent_unit ?? 'day') : null,
        want_tags: dto.type === 'exchange' ? dto.want_tags : null,
        meeting_location: dto.meeting_location ?? null,
        status: 'pending_review',
      })
      .select(LISTING_COLUMNS)
      .single();

    if (error || !listing) {
      this.logger.error(`Listing insert failed for ${userId}: ${error?.message}`);
      throw new BadRequestException(error?.message ?? 'Could not create listing');
    }

    const { error: queueError } = await supabase.from('moderation_queue').insert({
      listing_id: listing.id,
      status: 'pending',
      ai_flag_score: null,
    });

    if (queueError) {
      // Don't leave a listing stranded with no queue row — roll it back.
      await supabase.from('listings').delete().eq('id', listing.id);
      this.logger.error(`Moderation enqueue failed: ${queueError.message}`);
      throw new BadRequestException('Could not submit listing for review');
    }

    return listing;
  }
}
