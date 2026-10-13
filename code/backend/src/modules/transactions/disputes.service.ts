import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { getSupabaseAdmin } from '../../database/supabase.client.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { ResolveDisputeDto } from './dto/transaction.dto.js';
import { TransactionsService } from './transactions.service.js';

const DISPUTE_COLUMNS =
  'id, transaction_id, raised_by, reason, status, admin_id, admin_note, resolution, outcome, penalty_amount, penalty_user_id, transaction_status_before, created_at, resolved_at';

/**
 * Admin side of disputes (activity diagram 3):
 *   open ─review (ask for more evidence)─▶ under_review ─resolve─▶ resolved
 *
 * The evidence is the before/after condition photos captured at handoff and
 * return, shown side by side. A human decides every outcome — nothing here is
 * automatic (proposal Section 5.1: "never fully auto-reject or auto-ban").
 */
@Injectable()
export class DisputesService {
  constructor(
    private readonly transactions: TransactionsService,
    private readonly notifications: NotificationsService,
  ) {}

  private async load(disputeId: string) {
    const { data, error } = await getSupabaseAdmin()
      .from('disputes')
      .select(DISPUTE_COLUMNS)
      .eq('id', disputeId)
      .single();
    if (error || !data) throw new NotFoundException('Dispute not found');
    return data;
  }

  /** Open and under-review disputes, each with the full deal and its photos. */
  async listOpen() {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('disputes')
      .select(DISPUTE_COLUMNS)
      .in('status', ['open', 'under_review'])
      .order('created_at', { ascending: true });
    if (error) throw new BadRequestException(error.message);
    if (!data?.length) return [];

    const { data: txs } = await supabase
      .from('transactions')
      .select('id, listing_id, type, buyer_id, seller_id, agreed_price, status, meeting_location, chat_id, offer_id, created_at, updated_at, completed_at')
      .in('id', data.map((d) => d.transaction_id));
    const txById = new Map((txs ?? []).map((t) => [t.id, t]));

    return Promise.all(
      data.map(async (dispute) => {
        const tx = txById.get(dispute.transaction_id);
        // Admin view: no "my role", so the viewer id is null.
        const deal = tx ? await this.transactions.buildDetail(tx as never, null) : null;
        return {
          ...dispute,
          raised_by_role: tx ? (dispute.raised_by === tx.buyer_id ? 'buyer' : 'seller') : null,
          deal,
        };
      }),
    );
  }

  /** Ask the parties for more evidence before deciding. */
  async review(disputeId: string, adminId: string, note: string) {
    const dispute = await this.load(disputeId);
    if (dispute.status === 'resolved') throw new BadRequestException('This dispute is already resolved');

    const { data, error } = await getSupabaseAdmin()
      .from('disputes')
      .update({ status: 'under_review', admin_id: adminId, admin_note: note })
      .eq('id', disputeId)
      .select(DISPUTE_COLUMNS)
      .single();
    if (error || !data) throw new BadRequestException(error?.message ?? 'Could not update the dispute');

    const { data: tx } = await getSupabaseAdmin()
      .from('transactions')
      .select('buyer_id, seller_id')
      .eq('id', dispute.transaction_id)
      .single();
    if (tx) {
      await this.notifications.notifyMany([tx.buyer_id, tx.seller_id], 'dispute_update', {
        title: 'Admin needs more information',
        body: note,
        transaction_id: dispute.transaction_id,
        dispute_id: disputeId,
      });
    }
    return data;
  }

  /**
   * release → escrow to the seller, deal completed.
   * refund  → escrow back to the buyer, deal refunded; if the item never
   *           changed hands, the listing goes back on the feed.
   * Optionally records a penalty against the party at fault.
   */
  async resolve(disputeId: string, adminId: string, dto: ResolveDisputeDto) {
    const supabase = getSupabaseAdmin();
    const dispute = await this.load(disputeId);
    if (dispute.status === 'resolved') throw new BadRequestException('This dispute is already resolved');

    const { data: tx } = await supabase
      .from('transactions')
      .select('id, listing_id, type, buyer_id, seller_id, agreed_price, status, meeting_location, chat_id, offer_id, created_at, updated_at, completed_at')
      .eq('id', dispute.transaction_id)
      .single();
    if (!tx) throw new NotFoundException('Deal not found');
    if (tx.status !== 'disputed') throw new BadRequestException('This deal is not in dispute');

    const penalty = Number(dto.penalty_amount ?? 0);
    if (penalty > 0 && !dto.penalty_party) {
      throw new BadRequestException('Choose who the penalty applies to');
    }
    const penaltyUserId =
      penalty > 0 ? (dto.penalty_party === 'buyer' ? tx.buyer_id : tx.seller_id) : null;

    // Close the dispute first; the conditional update stops two admins resolving twice.
    const { data: closed, error } = await supabase
      .from('disputes')
      .update({
        status: 'resolved',
        admin_id: adminId,
        outcome: dto.outcome,
        resolution: dto.resolution,
        penalty_amount: penalty > 0 ? penalty : null,
        penalty_user_id: penaltyUserId,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', disputeId)
      .neq('status', 'resolved')
      .select(DISPUTE_COLUMNS)
      .maybeSingle();
    if (error) throw new BadRequestException(error.message);
    if (!closed) throw new BadRequestException('This dispute was resolved by someone else just now');

    const now = new Date().toISOString();
    const handedOver = dispute.transaction_status_before === 'in_use';

    if (dto.outcome === 'release') {
      // Admin found for the seller: everything held goes to them (for a lend
      // deal that includes the deposit — e.g. the item came back damaged).
      await supabase
        .from('transactions')
        .update({ status: 'completed', completed_at: now, updated_at: now })
        .eq('id', tx.id);
      await this.transactions.settle(tx as never, 'all_to_seller');
      await supabase
        .from('listings')
        .update({ status: tx.type === 'lend' ? 'live' : 'completed' })
        .eq('id', tx.listing_id);
    } else {
      await supabase
        .from('transactions')
        .update({ status: 'refunded', updated_at: now })
        .eq('id', tx.id);
      await this.transactions.refund(tx.id);
      // If the item never left the seller, it can go back on the feed.
      // If a borrowed item is still out, the owner relists it themselves.
      await supabase
        .from('listings')
        .update({ status: handedOver ? 'removed' : 'live' })
        .eq('id', tx.listing_id);
    }

    if (penaltyUserId) {
      const { data: user } = await supabase
        .from('users')
        .select('penalty_total')
        .eq('id', penaltyUserId)
        .single();
      await supabase
        .from('users')
        .update({ penalty_total: Number(user?.penalty_total ?? 0) + penalty })
        .eq('id', penaltyUserId);
    }

    const verdict =
      dto.outcome === 'release' ? 'Escrow released to the seller.' : 'Escrow refunded to the buyer.';
    await this.notifications.notifyMany([tx.buyer_id, tx.seller_id], 'dispute_resolved', {
      title: 'Dispute resolved',
      body: `${verdict} ${dto.resolution}`,
      transaction_id: tx.id,
      dispute_id: disputeId,
    });
    if (penaltyUserId) {
      await this.notifications.notify(penaltyUserId, 'dispute_resolved', {
        title: 'Penalty applied',
        body: `A penalty of ₹${penalty} was recorded against your account for this deal.`,
        transaction_id: tx.id,
        dispute_id: disputeId,
      });
    }

    return closed;
  }
}
