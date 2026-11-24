import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { getSupabaseAdmin } from '../../database/supabase.client.js';
import { campusDay } from '../../common/dates/campus-day.js';
import { NotificationsService } from '../notifications/notifications.service.js';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(private readonly notifications: NotificationsService) {}

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

    // Only a listing that is waiting for review can be approved. Approving a
    // removed or already-live listing again must never put it on the feed.
    const { data, error } = await supabase
      .from('listings')
      .update({ status: 'live' })
      .eq('id', listingId)
      .eq('status', 'pending_review')
      .select('id, status, owner_id, title, category, type, description, want_tags')
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    if (!data) throw new BadRequestException('Only a listing waiting for review can be approved');

    const { error: queueError } = await supabase
      .from('moderation_queue')
      .update({ status: 'approved', reviewed_by: adminId, reviewed_at: new Date().toISOString() })
      .eq('listing_id', listingId)
      .eq('status', 'pending');

    if (queueError) throw new BadRequestException(queueError.message);

    await this.notifications.notify(data.owner_id, 'listing_approved', {
      title: 'Your listing is live',
      body: `"${data.title}" passed review and is now on the campus feed.`,
      listing_id: data.id,
    });
    await this.notifications.notifyCategorySubscribers(data);
    await this.notifications.notifyExchangeMatches(data);

    return { id: data.id, status: data.status };
  }

  async rejectListing(listingId: string, adminId: string, reason: string) {
    const supabase = getSupabaseAdmin();


    const { data, error } = await supabase
      .from('listings')
      .update({ status: 'removed' })
      .eq('id', listingId)
      .eq('status', 'pending_review')
      .select('id, status, owner_id, title')
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    // A live listing is taken down instead (POST /admin/listings/:id/takedown), which records why.
    if (!data) throw new BadRequestException('Only a listing waiting for review can be rejected');

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

    await this.notifications.notify(data.owner_id, 'listing_rejected', {
      title: 'Listing not approved',
      body: `"${data.title}" was not published. Reason: ${reason}`,
      listing_id: data.id,
    });

    return { id: data.id, status: data.status };
  }

  /**
   * Platform analytics for the admin tab. The headline number is the proposal's
   * primary metric: time-to-listing-clearance (submitted → approved/rejected).
   */
  async stats() {
    const supabase = getSupabaseAdmin();
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();

    const [reviewedRes, pendingRes, listingsRes, dealsRes, disputesRes, usersRes] = await Promise.all([
      supabase
        .from('moderation_queue')
        .select('created_at, reviewed_at, status, reason')
        .not('reviewed_at', 'is', null)
        .gte('reviewed_at', since)
        .order('reviewed_at', { ascending: false })
        .limit(1000),
      supabase
        .from('moderation_queue')
        .select('created_at')
        .eq('status', 'pending')
        .order('created_at', { ascending: true }),
      supabase.from('listings').select('status, type').limit(10000),
      supabase.from('transactions').select('id, status, type, completed_at').limit(10000),
      supabase.from('disputes').select('status').limit(10000),
      supabase.from('users').select('id_verified').limit(10000),
    ]);
    for (const r of [reviewedRes, pendingRes, listingsRes, dealsRes, disputesRes, usersRes]) {
      if (r.error) throw new BadRequestException(r.error.message);
    }
    const deals = await this.dealMetrics(
      (dealsRes.data ?? []) as { id: string; status: string; type: string; completed_at: string | null }[],
    );

    // An edit closes the old review as "superseded" — that isn't an admin decision.
    const decided = (reviewedRes.data ?? []).filter((r) => r.reason !== 'Superseded by an edit');
    const minutes = decided
      .map((r) => (new Date(r.reviewed_at as string).getTime() - new Date(r.created_at as string).getTime()) / 60_000)
      .filter((m) => Number.isFinite(m) && m >= 0)
      .sort((a, b) => a - b);
    const pick = (q: number) =>
      minutes.length ? Math.round(minutes[Math.min(minutes.length - 1, Math.floor(q * minutes.length))]) : null;
    const tally = <T extends Record<string, unknown>>(rows: T[] | null, key: keyof T) =>
      (rows ?? []).reduce<Record<string, number>>((acc, row) => {
        const k = String(row[key]);
        acc[k] = (acc[k] ?? 0) + 1;
        return acc;
      }, {});

    const oldestPending = pendingRes.data?.[0]?.created_at as string | undefined;
    const approved = decided.filter((r) => r.status === 'approved').length;

    return {
      clearance: {
        window_days: 30,
        reviewed: minutes.length,
        median_minutes: pick(0.5),
        p90_minutes: pick(0.9),
        average_minutes: minutes.length ? Math.round(minutes.reduce((a, b) => a + b, 0) / minutes.length) : null,
        within_24h_percent: minutes.length
          ? Math.round((minutes.filter((m) => m <= 24 * 60).length / minutes.length) * 100)
          : null,
        approval_rate_percent: minutes.length ? Math.round((approved / minutes.length) * 100) : null,
      },
      queue: {
        pending: pendingRes.data?.length ?? 0,
        oldest_waiting_minutes: oldestPending
          ? Math.round((Date.now() - new Date(oldestPending).getTime()) / 60_000)
          : null,
      },
      listings_by_status: tally(listingsRes.data, 'status'),
      listings_by_type: tally(listingsRes.data, 'type'),
      deals_by_status: tally(dealsRes.data, 'status'),
      disputes_by_status: tally(disputesRes.data, 'status'),
      reports_open: await this.openReportCount(),
      deals,
      users_by_verification: tally(usersRes.data, 'id_verified'),
    };
  }

  /** Open student reports; 0 until migration 011 has been run. */
  private async openReportCount(): Promise<number> {
    const { count, error } = await getSupabaseAdmin()
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open');
    return error ? 0 : (count ?? 0);
  }

  /**
   * The proposal's secondary metrics (§6.2), all from the deal records:
   *
   *   completion rate   completed ÷ deals that have ended (completed + cancelled + refunded)
   *   lend share        lend deals ÷ all deals
   *   on-time returns   lend deals returned by their return date with no dispute
   *                     ÷ lend deals that are due (returned, or past their return date)
   *   dispute rate      deals with a dispute ÷ all deals (overall, and for lend deals)
   *
   * Each rate is null while there is nothing to divide by.
   */
  private async dealMetrics(rows: { id: string; status: string; type: string; completed_at: string | null }[]) {
    const supabase = getSupabaseAdmin();
    const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : null);

    const lendIds = rows.filter((r) => r.type === 'lend').map((r) => r.id);
    const [{ data: lendTerms }, { data: disputed }] = await Promise.all([
      lendIds.length
        ? supabase.from('lend_details').select('transaction_id, end_date').in('transaction_id', lendIds)
        : Promise.resolve({ data: [] as { transaction_id: string; end_date: string }[] }),
      supabase.from('disputes').select('transaction_id').limit(10000),
    ]);
    const disputedIds = new Set((disputed ?? []).map((d) => d.transaction_id as string));
    const dueBy = new Map((lendTerms ?? []).map((l) => [l.transaction_id as string, String(l.end_date)]));
    const today = campusDay();

    const ended = rows.filter((r) => ['completed', 'cancelled', 'refunded'].includes(r.status));
    const completed = rows.filter((r) => r.status === 'completed');

    const lend = rows.filter((r) => r.type === 'lend');
    const lendDue = lend.filter((r) => {
      const end = dueBy.get(r.id);
      if (!end) return false;
      if (r.status === 'completed') return true;
      // still out, or frozen in a dispute, after the return date
      return (r.status === 'in_use' || r.status === 'disputed') && end < today;
    });
    const onTime = lendDue.filter((r) => {
      const end = dueBy.get(r.id);
      return (
        r.status === 'completed' &&
        !!r.completed_at &&
        !!end &&
        r.completed_at.slice(0, 10) <= end &&
        !disputedIds.has(r.id)
      );
    });
    const lendDisputed = lend.filter((r) => disputedIds.has(r.id));
    const anyDisputed = rows.filter((r) => disputedIds.has(r.id));

    return {
      total: rows.length,
      ended: ended.length,
      completed: completed.length,
      completion_rate_percent: pct(completed.length, ended.length),
      lend: lend.length,
      lend_share_percent: pct(lend.length, rows.length),
      lend_due: lendDue.length,
      lend_returned_on_time: onTime.length,
      on_time_return_percent: pct(onTime.length, lendDue.length),
      disputed: anyDisputed.length,
      dispute_rate_percent: pct(anyDisputed.length, rows.length),
      lend_disputed: lendDisputed.length,
      lend_dispute_rate_percent: pct(lendDisputed.length, lend.length),
    };
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

    await this.notifications.notify(
      userId,
      decision === 'verified' ? 'id_verified' : 'id_rejected',
      decision === 'verified'
        ? { title: 'You are verified', body: 'Your student ID was approved. You can now list items, chat and trade.' }
        : { title: 'ID card not accepted', body: 'Your ID photo could not be verified. Upload a clearer photo from your profile.' },
    );

    return data;
  }
}
