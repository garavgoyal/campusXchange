import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { getSupabaseAdmin } from '../../database/supabase.client.js';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  /** Listings awaiting human review, newest first, with the listing joined in. */
  async pendingListings() {
    const supabase = getSupabaseAdmin();

    const { data: queue, error } = await supabase
      .from('moderation_queue')
      .select('id, listing_id, ai_flag_score, status, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw new BadRequestException(error.message);
    if (!queue?.length) return [];

    const { data: listings } = await supabase
      .from('listings')
      .select(
        'id, owner_id, type, title, description, images, category, condition, price, rent_amount, rent_unit, want_tags, meeting_location, status, created_at',
      )
      .in(
        'id',
        queue.map((q) => q.listing_id),
      );

    const byId = new Map((listings ?? []).map((l) => [l.id, l]));

    return queue
      .map((q) => ({ queue_id: q.id, ai_flag_score: q.ai_flag_score, listing: byId.get(q.listing_id) }))
      .filter((row) => row.listing);
  }

  /**
   * Approve: the queue row records who decided and when, and the listing goes
   * live. Both writes happen here so the two tables can't disagree.
   */
  async approveListing(listingId: string, adminId: string) {
    const supabase = getSupabaseAdmin();

    const { error: queueError } = await supabase
      .from('moderation_queue')
      .update({ status: 'approved', reviewed_by: adminId, reviewed_at: new Date().toISOString() })
      .eq('listing_id', listingId)
      .eq('status', 'pending');

    if (queueError) throw new BadRequestException(queueError.message);

    const { data, error } = await supabase
      .from('listings')
      .update({ status: 'live' })
      .eq('id', listingId)
      .select('id, status')
      .single();

    if (error || !data) throw new NotFoundException('Listing not found');
    return data;
  }

  async rejectListing(listingId: string, adminId: string, reason: string) {
    const supabase = getSupabaseAdmin();

    const { error: queueError } = await supabase
      .from('moderation_queue')
      .update({
        status: 'rejected',
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
        reason,
      })
      .eq('listing_id', listingId)
      .eq('status', 'pending');

    if (queueError) throw new BadRequestException(queueError.message);

    const { data, error } = await supabase
      .from('listings')
      .update({ status: 'removed' })
      .eq('id', listingId)
      .select('id, status')
      .single();

    if (error || !data) throw new NotFoundException('Listing not found');
    return data;
  }

  /** Students whose uploaded ID card is still awaiting review. */
  async pendingIdVerifications() {
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('users')
      .select('id, name, email, roll_number, id_card_image_url, id_verified, created_at')
      .eq('id_verified', 'pending')
      .not('id_card_image_url', 'is', null)
      .order('created_at', { ascending: false });

    if (error) throw new BadRequestException(error.message);

    const bucket = process.env.SUPABASE_ID_CARD_BUCKET ?? 'id-cards';

    // The bucket is private, so hand the admin a short-lived signed URL rather
    // than a path they can't open.
    return Promise.all(
      (data ?? []).map(async (user) => {
        let signed_url: string | null = null;
        if (user.id_card_image_url) {
          const { data: signed } = await supabase.storage
            .from(bucket)
            .createSignedUrl(user.id_card_image_url, 60 * 10);
          signed_url = signed?.signedUrl ?? null;
        }
        return { ...user, signed_url };
      }),
    );
  }

  async decideIdVerification(userId: string, decision: 'verified' | 'rejected') {
    const { data, error } = await getSupabaseAdmin()
      .from('users')
      .update({ id_verified: decision })
      .eq('id', userId)
      .select('id, id_verified')
      .single();

    if (error || !data) throw new NotFoundException('User not found');
    return data;
  }
}
