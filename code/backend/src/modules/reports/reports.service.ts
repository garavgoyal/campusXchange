import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { getSupabaseAdmin } from '../../database/supabase.client.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { TransactionsService } from '../transactions/transactions.service.js';
import type { CreateReportDto, ReportReason } from './dto/report.dto.js';

const REASON_LABELS: Record<ReportReason, string> = {
  prohibited: 'Prohibited item',
  scam: 'Scam or fraud',
  fake: 'Fake or misleading',
  wrong_info: 'Wrong details',
  offensive: 'Offensive',
  other: 'Something else',
};

/** Listings that other students can see, so can be reported or taken down. */
const VISIBLE = ['live', 'reserved'];

const REPORT_COLUMNS =
  'id, reporter_id, listing_id, listing_title, reported_user_id, reason, details, status, admin_id, admin_note, created_at, reviewed_at';

type ReportRow = {
  id: string;
  reporter_id: string;
  listing_id: string | null;
  listing_title: string | null;
  reported_user_id: string | null;
  reason: ReportReason;
  details: string | null;
  status: 'open' | 'actioned' | 'dismissed';
};

/**
 * Students report listings or people; admins review the reports and can take
 * a listing down even after it went live (SRS FR-MOD-8 to FR-MOD-10).
 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    private readonly notifications: NotificationsService,
    private readonly transactions: TransactionsService,
  ) {}

  // ---------------------------------------------------------------------------
  // Students
  // ---------------------------------------------------------------------------

  async create(reporterId: string, dto: CreateReportDto) {
    if (!!dto.listing_id === !!dto.user_id) {
      throw new BadRequestException('Report either a listing or a person');
    }
    const supabase = getSupabaseAdmin();
    let listingTitle: string | null = null;

    if (dto.listing_id) {
      const { data: listing } = await supabase
        .from('listings')
        .select('id, owner_id, title, status')
        .eq('id', dto.listing_id)
        .maybeSingle();
      if (!listing || !VISIBLE.includes(listing.status as string)) throw new NotFoundException('Listing not found');
      if (listing.owner_id === reporterId) throw new BadRequestException('You cannot report your own listing');
      listingTitle = listing.title as string;
    } else {
      if (dto.user_id === reporterId) throw new BadRequestException('You cannot report yourself');
      // Only someone you have actually dealt with: you share a chat.
      const { count } = await supabase
        .from('chats')
        .select('id', { count: 'exact', head: true })
        .or(
          `and(initiator_id.eq.${reporterId},owner_id.eq.${dto.user_id}),and(initiator_id.eq.${dto.user_id},owner_id.eq.${reporterId})`,
        );
      if (!count) throw new ForbiddenException('You can only report someone you have chatted with');
    }

    const { data, error } = await supabase
      .from('reports')
      .insert({
        reporter_id: reporterId,
        listing_id: dto.listing_id ?? null,
        listing_title: listingTitle,
        reported_user_id: dto.user_id ?? null,
        reason: dto.reason,
        details: dto.details?.trim() || null,
      })
      .select(REPORT_COLUMNS)
      .single();
    if (error || !data) {
      if (error?.code === '23505') {
        throw new BadRequestException('You already reported this. An admin will look at it soon.');
      }
      throw new BadRequestException(error?.message ?? 'Could not send the report');
    }

    await this.notifications.notifyAdmins('report_opened', {
      title: `New report: ${REASON_LABELS[dto.reason]}`,
      body: listingTitle ? `Listing "${listingTitle}"` : 'A student was reported after a chat',
      report_id: data.id as string,
      ...(dto.listing_id ? { listing_id: dto.listing_id } : {}),
    });
    return data;
  }

  // ---------------------------------------------------------------------------
  // Admins
  // ---------------------------------------------------------------------------

  /** Open reports, oldest first, with what was reported and how often. */
  async listOpen() {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('reports')
      .select(REPORT_COLUMNS)
      .eq('status', 'open')
      .order('created_at', { ascending: true })
      .limit(200);
    if (error) throw new BadRequestException(error.message);
    const rows = (data ?? []) as (ReportRow & Record<string, unknown>)[];
    if (!rows.length) return [];

    const listingIds = [...new Set(rows.map((r) => r.listing_id).filter(Boolean))] as string[];
    const { data: listings } = listingIds.length
      ? await supabase
          .from('listings')
          .select('id, title, type, status, images, owner_id, price, rent_amount, rent_unit')
          .in('id', listingIds)
      : { data: [] as Record<string, unknown>[] };
    const userIds = [
      ...new Set(
        rows
          .flatMap((r) => [r.reporter_id, r.reported_user_id])
          .concat((listings ?? []).map((l) => l.owner_id as string))
          .filter(Boolean),
      ),
    ] as string[];
    const { data: users } = await supabase
      .from('users')
      .select('id, name, email, penalty_total')
      .in('id', userIds);
    const person = (id: string | null) => {
      const u = (users ?? []).find((x) => x.id === id);
      return u ? { id: u.id, name: u.name || (u.email as string).split('@')[0], email: u.email, penalty_total: Number(u.penalty_total ?? 0) } : null;
    };
    const sameTarget = (r: ReportRow) =>
      rows.filter((x) => (r.listing_id ? x.listing_id === r.listing_id : x.reported_user_id === r.reported_user_id)).length;

    return rows.map((r) => {
      const listing = (listings ?? []).find((l) => l.id === r.listing_id) ?? null;
      return {
        ...r,
        reason_label: REASON_LABELS[r.reason],
        reporter: person(r.reporter_id),
        listing: listing ? { ...listing, owner: person(listing.owner_id as string) } : null,
        reported_user: person(r.reported_user_id),
        open_reports_on_target: sameTarget(r),
      };
    });
  }

  /**
   * Decide a report. For a listing, "actioned" takes the listing down. For a
   * person it records that the admin dealt with it (a warning, a penalty in a
   * dispute, or blocking their ID verification).
   */
  async resolve(reportId: string, adminId: string, outcome: 'actioned' | 'dismissed', note: string) {
    const supabase = getSupabaseAdmin();
    const { data: report } = await supabase.from('reports').select(REPORT_COLUMNS).eq('id', reportId).maybeSingle();
    if (!report) throw new NotFoundException('Report not found');
    const r = report as ReportRow;
    if (r.status !== 'open') throw new BadRequestException('This report has already been decided');

    if (outcome === 'actioned' && r.listing_id) {
      await this.takedown(r.listing_id, adminId, note);
      return this.reportById(reportId);
    }

    const { data: closed } = await supabase
      .from('reports')
      .update({ status: outcome, admin_id: adminId, admin_note: note, reviewed_at: new Date().toISOString() })
      .eq('id', reportId)
      .eq('status', 'open')
      .select('id')
      .maybeSingle();
    if (!closed) throw new BadRequestException('This report was decided by someone else just now');

    await this.notifications.notify(r.reporter_id, 'report_update', {
      title: outcome === 'actioned' ? 'Thanks, we acted on your report' : 'We reviewed your report',
      body:
        outcome === 'actioned'
          ? 'An admin looked into it and took action.'
          : `An admin looked into it and found nothing that breaks the rules. ${note}`,
      report_id: reportId,
    });
    return this.reportById(reportId);
  }

  /**
   * Takes a listing off the feed for good (migration 011 keeps it off). A deal
   * that has not reached the handoff is called off and refunded; one where the
   * item has already changed hands (a lend in use, a dispute) is left to finish.
   * Every open report on the listing is closed as actioned.
   */
  async takedown(listingId: string, adminId: string, reason: string) {
    const supabase = getSupabaseAdmin();
    const { data: listing } = await supabase
      .from('listings')
      .select('id, owner_id, title, status, taken_down_at')
      .eq('id', listingId)
      .maybeSingle();
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.taken_down_at) throw new BadRequestException('This listing has already been taken down');
    if (!['live', 'reserved', 'pending_review'].includes(listing.status as string)) {
      throw new BadRequestException('Only a listing that is live, reserved or waiting for review can be taken down');
    }

    const deals = await this.transactions.activeDealsFor(listingId);
    let cancelled = 0;
    let leftOpen = 0;
    for (const tx of deals) {
      if (TransactionsService.canCloseBeforeHandoff(tx)) {
        await this.transactions.cancelForTakedown(tx, reason);
        cancelled += 1;
      } else {
        leftOpen += 1;
      }
    }

    const now = new Date().toISOString();
    const { error } = await supabase
      .from('listings')
      .update({ status: 'removed', taken_down_at: now, taken_down_reason: reason, taken_down_by: adminId })
      .eq('id', listingId);
    if (error) throw new BadRequestException(error.message);

    // A takedown while it was still waiting for review also closes the queue entry.
    await supabase
      .from('moderation_queue')
      .update({ status: 'rejected', reviewed_by: adminId, reviewed_at: now, reason: `Taken down: ${reason}` })
      .eq('listing_id', listingId)
      .eq('status', 'pending');

    const { data: closedReports } = await supabase
      .from('reports')
      .update({ status: 'actioned', admin_id: adminId, admin_note: reason, reviewed_at: now })
      .eq('listing_id', listingId)
      .eq('status', 'open')
      .select('id, reporter_id');

    await this.notifications.notify(listing.owner_id as string, 'listing_removed', {
      title: 'Your listing was taken down',
      body: `"${listing.title}" was removed by an admin. Reason: ${reason}`,
      listing_id: listingId,
    });
    const reporters = [...new Set((closedReports ?? []).map((x) => x.reporter_id as string))];
    if (reporters.length) {
      await this.notifications.notifyMany(reporters, 'report_update', {
        title: 'Thanks, we acted on your report',
        body: `"${listing.title}" has been taken down.`,
        listing_id: listingId,
      });
    }
    this.logger.log(`Listing ${listingId} taken down by ${adminId}: ${cancelled} deal(s) cancelled, ${leftOpen} left open`);

    return {
      id: listingId,
      status: 'removed' as const,
      cancelled_deals: cancelled,
      open_deals: leftOpen,
      reports_closed: closedReports?.length ?? 0,
    };
  }

  private async reportById(id: string) {
    const { data } = await getSupabaseAdmin().from('reports').select(REPORT_COLUMNS).eq('id', id).single();
    return data;
  }
}
