import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { getSupabaseAdmin } from '../../database/supabase.client.js';
import type { CreateListingDto, UpdateListingDto } from './dto/create-listing.dto.js';
import { CampusService } from '../campus/campus.service.js';
import { matchedTags } from '../../common/matching/want-tags.js';
import { requireImage } from '../../common/uploads/image-file.js';
import { requireOwnImageUrls } from '../../common/uploads/own-image-urls.js';

export const FEED_PAGE_SIZE = 20;
const FEED_MAX_PAGE = 50;

/**
 * Search text goes into a PostgREST `or=(...)` filter, where commas, brackets,
 * dots and colons are syntax. Strip them so a search can only ever be a search:
 * "Casio fx-991, (new)" becomes "Casio fx-991   new ".
 */
export function cleanSearch(raw: string | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\p{L}\p{M}\p{N}\s\-+#&]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  return cleaned.length ? cleaned : null;
}

const LISTING_COLUMNS =
  'id, owner_id, type, title, description, images, category, condition, price, rent_amount, rent_unit, want_tags, meeting_location, status, created_at';

export type ListingRow = Record<string, unknown> & { meeting_location?: string | null };

@Injectable()
export class ListingsService {
  private readonly logger = new Logger(ListingsService.name);

  constructor(private readonly campus: CampusService) {}

  /**
   * Guests may browse, but never see where a handoff happens — that is the one
   * field a signed-out stranger should not get. Replaced, not just omitted, so
   * the app can render a "Sign in to see" hint in its place.
   */
  private hideLocationForGuests(rows: ListingRow[], isSignedIn: boolean): ListingRow[] {
    if (isSignedIn) return rows;
    return rows.map((row) => ({ ...row, meeting_location: null, location_hidden: true }));
  }

  /**
   * The feed. `sort = 'nearest'` orders by the distance from the viewer's hostel
   * to each listing's meeting point (no GPS — see migration 008). Guests, and
   * students who haven't chosen a hostel, get the normal newest-first feed.
   * For a viewer with a hostel, every listing also carries `distance_m`.
   * A signed-in student never sees their own listings here — those are under
   * "My listings".
   */
  async findLive(
    params: {
      type?: string;
      category?: string;
      search?: string;
      limit?: number;
      offset?: number;
      sort?: string;
    },
    viewerId: string | null,
  ) {
    const supabase = getSupabaseAdmin();
    const isSignedIn = !!viewerId;
    const limit = Math.min(Math.max(1, Math.floor(params.limit ?? FEED_PAGE_SIZE)), FEED_MAX_PAGE);
    const offset = Math.max(0, Math.floor(params.offset ?? 0));
    const search = cleanSearch(params.search);

    let hostel: string | null = null;
    if (viewerId) {
      const { data: me } = await supabase.from('users').select('hostel').eq('id', viewerId).maybeSingle();
      hostel = (me?.hostel as string | null) ?? null;
    }
    const distanceTo = await this.campus.distanceFrom(hostel);
    const withDistance = (rows: ListingRow[]) =>
      hostel ? rows.map((row) => ({ ...row, distance_m: distanceTo(row.meeting_location) })) : rows;

    if (params.sort === 'nearest' && hostel && params.type) {
      const { data: ranked, error: rankError } = await supabase.rpc('cx_feed_nearest', {
        p_hostel: hostel,
        p_type: params.type,
        p_category: params.category ?? null,
        p_search: search,
        p_limit: limit,
        p_offset: offset,
        p_viewer: viewerId,
      });
      if (rankError) throw new BadRequestException(rankError.message);
      const ids = ((ranked ?? []) as { id: string }[]).map((r) => r.id);
      if (!ids.length) return [];
      const { data: rows, error } = await supabase.from('listings').select(LISTING_COLUMNS).in('id', ids);
      if (error) throw new BadRequestException(error.message);
      const byId = new Map((rows ?? []).map((r) => [r.id as string, r as ListingRow]));
      const ordered = ids.map((id) => byId.get(id)).filter((r): r is ListingRow => !!r);
      return this.hideLocationForGuests(withDistance(ordered), isSignedIn);
    }

    let query = supabase.from('listings').select(LISTING_COLUMNS).eq('status', 'live');
    if (viewerId) query = query.neq('owner_id', viewerId);

    if (params.type) query = query.eq('type', params.type);
    if (params.category) query = query.eq('category', params.category);
    if (search) {
      const term = `%${search}%`;
      query = query.or(`title.ilike.${term},description.ilike.${term}`);
    }

    // Page through the feed newest-first; the app asks for the next page as you scroll.
    const { data, error } = await query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw new BadRequestException(error.message);

    return this.hideLocationForGuests(withDistance((data ?? []) as ListingRow[]), isSignedIn);
  }

  /**
   * Anyone may open a live listing. Once it is reserved or sold it leaves the
   * feed, but the owner and anyone already chatting about it can still open it
   * (the chat and deal screens show it as context).
   */
  async findOne(id: string, viewerId: string | null) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('listings')
      .select(LISTING_COLUMNS)
      .eq('id', id)
      .single();

    if (error || !data) throw new NotFoundException('Listing not found');
    if (data.status !== 'live') {
      let allowed = !!viewerId && data.owner_id === viewerId;
      if (!allowed && viewerId) {
        const { count } = await supabase
          .from('chats')
          .select('id', { count: 'exact', head: true })
          .eq('listing_id', id)
          .eq('initiator_id', viewerId);
        allowed = !!count;
      }
      if (!allowed) throw new NotFoundException('Listing not available');
    }
    const isSignedIn = !!viewerId;

    let row = data as ListingRow;
    // The owner of a listing an admin took down sees why (migration 011).
    if (data.status === 'removed' && viewerId && data.owner_id === viewerId) {
      const { data: takedown, error: takedownError } = await supabase
        .from('listings')
        .select('taken_down_reason')
        .eq('id', id)
        .maybeSingle();
      if (!takedownError && takedown?.taken_down_reason) row = { ...row, taken_down_reason: takedown.taken_down_reason };
    }
    if (viewerId) {
      const { data: me } = await supabase.from('users').select('hostel').eq('id', viewerId).maybeSingle();
      if (me?.hostel) {
        const distanceTo = await this.campus.distanceFrom(me.hostel as string);
        row = { ...row, distance_m: distanceTo(row.meeting_location) };
      }
    }
    return this.hideLocationForGuests([row], isSignedIn)[0];
  }

  /**
   * Exchange matching: live listings by other students that fit what this
   * Exchange listing wants (see common/matching/want-tags.ts), each with the
   * tags it matched. Empty for Sell/Lend listings.
   */
  async matchesFor(listingId: string, viewerId: string | null) {
    const supabase = getSupabaseAdmin();
    const { data: wanted } = await supabase
      .from('listings')
      .select('id, owner_id, type, want_tags, status')
      .eq('id', listingId)
      .maybeSingle();
    if (!wanted) throw new NotFoundException('Listing not found');
    if (wanted.type !== 'exchange' || !(wanted.want_tags as string[] | null)?.length) return [];

    // The pilot has hundreds of listings at most, so matching in memory keeps the
    // rule identical everywhere (alerts, this list, the tests).
    const { data: live, error } = await supabase
      .from('listings')
      .select(LISTING_COLUMNS)
      .eq('status', 'live')
      .neq('owner_id', wanted.owner_id)
      .neq('id', listingId)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (error) throw new BadRequestException(error.message);

    const rows = ((live ?? []) as ListingRow[])
      .map((row) => ({
        ...row,
        matched_tags: matchedTags(wanted.want_tags as string[], {
          title: String(row.title ?? ''),
          description: row.description as string | null,
          category: row.category as string | null,
        }),
      }))
      .filter((row) => row.matched_tags.length > 0)
      .slice(0, 20);
    return this.hideLocationForGuests(rows, !!viewerId);
  }

  /** The caller's own listings, at any status, so they can see "pending review". */
  async findMine(userId: string) {
    const mine = (columns: string) =>
      getSupabaseAdmin().from('listings').select(columns).eq('owner_id', userId).order('created_at', { ascending: false });

    // taken_down_reason tells the owner why an admin removed a listing (migration 011).
    let { data, error } = await mine(`${LISTING_COLUMNS}, taken_down_reason`);
    if (error) ({ data, error } = await mine(LISTING_COLUMNS));
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  /**
   * The owner edits their listing. Any change sends it back through moderation
   * (pending_review + a fresh queue row), so nothing reaches the feed unreviewed.
   * Allowed while it is pending, live, or was rejected (to fix and resubmit) —
   * never while a deal is in progress or after it is done.
   */
  async update(listingId: string, userId: string, dto: UpdateListingDto) {
    const supabase = getSupabaseAdmin();

    const { data: current, error } = await supabase
      .from('listings')
      .select(LISTING_COLUMNS)
      .eq('id', listingId)
      .single();
    if (error || !current) throw new NotFoundException('Listing not found');
    if (current.owner_id !== userId) throw new ForbiddenException('You can only edit your own listings');

    let editable = current.status === 'pending_review' || current.status === 'live';
    if (current.status === 'removed') {
      const { data: lastReview } = await supabase
        .from('moderation_queue')
        .select('status')
        .eq('listing_id', listingId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      editable = lastReview?.status === 'rejected';
    }
    if (current.status === 'reserved') {
      throw new BadRequestException('This item has a deal in progress — it can\'t be edited until the deal ends');
    }
    if (!editable) throw new BadRequestException('This listing can no longer be edited');

    const type = current.type as 'sell' | 'lend' | 'exchange';
    const patch: Record<string, unknown> = {};
    for (const key of ['title', 'description', 'category', 'condition', 'meeting_location', 'images'] as const) {
      if (dto[key] !== undefined) patch[key] = dto[key];
    }
    if (dto.images !== undefined) {
      requireOwnImageUrls(dto.images, userId, 'Listing photos', (current.images as string[] | null) ?? []);
    }
    if (dto.meeting_location !== undefined) {
      patch.meeting_location = await this.campus.meetingPoint(dto.meeting_location);
    }
    if (type === 'sell' && dto.price !== undefined) patch.price = dto.price;
    if (type === 'lend' && dto.rent_amount !== undefined) patch.rent_amount = dto.rent_amount;
    if (type === 'lend' && dto.rent_unit !== undefined) patch.rent_unit = dto.rent_unit;
    if (type === 'exchange' && dto.want_tags !== undefined) {
      if (!dto.want_tags.length) throw new BadRequestException('An exchange listing needs at least one want tag');
      patch.want_tags = dto.want_tags;
    }
    if (type === 'sell' && patch.price === null) throw new BadRequestException('A sell listing needs a price');
    if (!Object.keys(patch).length) throw new BadRequestException('Nothing to change');

    // Only move forward from the status we read, so a deal starting at the same
    // moment wins and this edit is refused rather than un-reserving the item.
    const { data: updated, error: updateError } = await supabase
      .from('listings')
      .update({ ...patch, status: 'pending_review', updated_at: new Date().toISOString() })
      .eq('id', listingId)
      .eq('status', current.status)
      .select(LISTING_COLUMNS)
      .maybeSingle();
    if (updateError) throw new BadRequestException(updateError.message);
    if (!updated) throw new BadRequestException('This listing changed in the meantime — refresh and try again');

    // Close any review still pending for the old version, then queue this one.
    await supabase
      .from('moderation_queue')
      .update({ status: 'rejected', reason: 'Superseded by an edit', reviewed_at: new Date().toISOString() })
      .eq('listing_id', listingId)
      .eq('status', 'pending');
    const { error: queueError } = await supabase
      .from('moderation_queue')
      .insert({ listing_id: listingId, status: 'pending', ai_flag_score: null });
    if (queueError) {
      this.logger.error(`Re-queue after edit failed for ${listingId}: ${queueError.message}`);
      throw new BadRequestException('Saved, but could not submit the edit for review — try again');
    }

    return updated;
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
      .select('id, owner_id, status')
      .eq('id', listingId)
      .single();

    if (error || !listing) throw new NotFoundException('Listing not found');
    if (listing.owner_id !== userId) {
      throw new ForbiddenException('You can only delete your own listings');
    }
    if (listing.status === 'reserved') {
      throw new BadRequestException('This item has a deal in progress — cancel the deal first');
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
    // This bucket is public, so the stored type must be a real photo: the bytes
    // decide the extension and content type, never the client's file name or label.
    const image = requireImage(file, 'Listing photos');

    const supabase = getSupabaseAdmin();
    const bucket = process.env.SUPABASE_LISTING_IMAGE_BUCKET ?? 'listing-images';
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${image.ext}`;

    const { error } = await supabase.storage.from(bucket).upload(path, file!.buffer, {
      contentType: image.mime,
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
    requireOwnImageUrls(dto.images, userId, 'Listing photos');
    const meetingLocation = await this.campus.meetingPoint(dto.meeting_location);

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
        meeting_location: meetingLocation,
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
