import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { getSupabaseAdmin } from '../../database/supabase.client.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { ResolveDisputeDto } from './dto/transaction.dto.js';
import { TX_COLUMNS, TransactionsService } from './transactions.service.js';

const DISPUTE_COLUMNS =
  'id, transaction_id, raised_by, reason, status, admin_id, admin_note, resolution, outcome, penalty_amount, penalty_tier, penalty_user_id, transaction_status_before, created_at, resolved_at';

/**
 * Penalty tiers, fixed before any dispute is decided (proposal §10: "define clear
 * escalation and penalty tiers"). Admins pick one; they can't type an amount.
 * Change the amounts here — the app reads them from GET /admin/disputes/penalty-tiers.
 */
export const PENALTY_TIERS = [
  {
    key: 'minor',
    label: 'Minor',
    amount: 50,
    examples: 'Returned a day or two late, one missed meetup',
  },
  {
    key: 'moderate',
    label: 'Moderate',
    amount: 200,
    examples: 'Item not as described, repeated no-shows, returned a week late',
  },
  {
    key: 'severe',
    label: 'Severe',
    amount: 500,
    examples: 'Item damaged or lost, attempted fraud',
  },
] as const;

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
      .select(TX_COLUMNS)
      .in('id', data.map((d) => d.transaction_id));
    const txById = new Map((txs ?? []).map((t) => [t.id, t]));

    // Each side's record so far, so a repeat offender is visible when deciding.
    const people = [...new Set((txs ?? []).flatMap((t) => [t.buyer_id as string, t.seller_id as string]))];
    const [{ data: totals }, { data: earlier }] = await Promise.all([
      supabase.from('users').select('id, penalty_total').in('id', people),
      supabase.from('disputes').select('penalty_user_id').in('penalty_user_id', people),
    ]);
    const record = (id: string) => ({
      penalty_total: Number(totals?.find((u) => u.id === id)?.penalty_total ?? 0),
      penalties: (earlier ?? []).filter((d) => d.penalty_user_id === id).length,
    });

    return Promise.all(
      data.map(async (dispute) => {
        const tx = txById.get(dispute.transaction_id);
        // Admin view: no "my role", so the viewer id is null.
        const deal = tx ? await this.transactions.buildDetail(tx as never, null) : null;
        return {
          ...dispute,
          raised_by_role: tx ? (dispute.raised_by === tx.buyer_id ? 'buyer' : 'seller') : null,
          buyer_record: tx ? record(tx.buyer_id as string) : null,
          seller_record: tx ? record(tx.seller_id as string) : null,
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
      .select(TX_COLUMNS)
      .eq('id', dispute.transaction_id)
      .single();
    if (!tx) throw new NotFoundException('Deal not found');
    if (tx.status !== 'disputed') throw new BadRequestException('This deal is not in dispute');

    const tier = dto.penalty_tier ? PENALTY_TIERS.find((t) => t.key === dto.penalty_tier) : undefined;
    const penalty = tier?.amount ?? 0;
    if (tier && !dto.penalty_party) {
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
        penalty_tier: tier?.key ?? null,
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

    // If the deal or money step fails, reopen the dispute so an admin can retry
    // instead of leaving it marked resolved with the escrow still frozen.
    const reopen = () =>
      supabase
        .from('disputes')
        .update({
          status: dispute.status,
          outcome: null,
          resolution: null,
          penalty_amount: null,
          penalty_tier: null,
          penalty_user_id: null,
          resolved_at: null,
        })
        .eq('id', disputeId);

    try {
      const { data: moved, error: moveError } = await supabase
        .from('transactions')
        .update(
          dto.outcome === 'release'
            ? { status: 'completed', completed_at: now, updated_at: now }
            : { status: 'refunded', updated_at: now },
        )
        .eq('id', tx.id)
        .eq('status', 'disputed')
        .select('id')
        .maybeSingle();
      if (moveError) throw new BadRequestException(moveError.message);
      if (!moved) throw new BadRequestException('This deal changed in the meantime — refresh and try again');

      try {
        if (dto.outcome === 'release') {
          // Admin found for the side that is owed the money: everything held goes
          // to them (for a lend deal that includes the deposit, e.g. returned damaged).
          await this.transactions.settle(tx as never, 'all_to_payee');
        } else {
          await this.transactions.refund(tx as never);
        }
      } catch (e) {
        await supabase.from('transactions').update({ status: 'disputed', completed_at: null, updated_at: now }).eq('id', tx.id);
        throw e;
      }
    } catch (e) {
      await reopen();
      throw e;
    }

    if (dto.outcome === 'release') {
      await supabase
        .from('listings')
        .update({ status: tx.type === 'lend' ? 'live' : 'completed' })
        .eq('id', tx.listing_id);
    } else {
      // If the item never left the seller, it can go back on the feed.
      // If a borrowed item is still out, the owner relists it themselves.
      await supabase
        .from('listings')
        .update({ status: handedOver ? 'removed' : 'live' })
        .eq('id', tx.listing_id);
    }

    if (penaltyUserId) {
      // One atomic UPDATE (migration 007). Falls back to read-then-write only if
      // the function hasn't been created yet.
      const { error: rpcError } = await supabase.rpc('add_penalty', { p_user: penaltyUserId, p_amount: penalty });
      if (rpcError) {
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
    }

    const payerIsSeller = (tx as { payer_id?: string | null }).payer_id === tx.seller_id;
    const verdict =
      dto.outcome === 'release'
        ? payerIsSeller ? 'The deal stands — escrow released to the buyer.' : 'Escrow released to the seller.'
        : payerIsSeller ? 'Escrow refunded to the seller.' : 'Escrow refunded to the buyer.';
    await this.notifications.notifyMany([tx.buyer_id, tx.seller_id], 'dispute_resolved', {
      title: 'Dispute resolved',
      body: `${verdict} ${dto.resolution}`,
      transaction_id: tx.id,
      dispute_id: disputeId,
    });
    if (penaltyUserId) {
      await this.notifications.notify(penaltyUserId, 'dispute_resolved', {
        title: 'Penalty applied',
        body: `A ${tier?.label.toLowerCase()} penalty of ₹${penalty} was recorded against your account for this deal.`,
        transaction_id: tx.id,
        dispute_id: disputeId,
      });
    }

    return closed;
  }
}
