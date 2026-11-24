import { randomInt } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { getSupabaseAdmin } from '../../database/supabase.client.js';
import { campusDay } from '../../common/dates/campus-day.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { CampusService } from '../campus/campus.service.js';
import { requireImage } from '../../common/uploads/image-file.js';
import type { CreateTransactionDto } from './dto/transaction.dto.js';

/**
 * The shared transaction core used by Sell, Lend and Exchange
 * (proposal Section 4.1 "In-app payments" + "QR-verified handoff").
 *
 *   pending_payment ─pay─▶ escrow_held ─show QR─▶ qr_issued ─scan─▶ completed       (sell / exchange)
 *                                                          └─scan─▶ in_use ─return scan─▶ completed (lend)
 *   any active state ─dispute─▶ disputed ─admin─▶ completed | refunded
 *   pending_payment / escrow_held / qr_issued ─cancel─▶ cancelled | refunded
 *
 * PAYMENTS ARE SIMULATED: escrow_holds records what would be held, released or
 * refunded, but no money moves. Swapping in a real gateway only changes pay(),
 * settle() and refund().
 *
 * Who scans whom: the person RECEIVING the item scans the QR shown by the
 * person HANDING IT OVER, after inspecting it and taking condition photos. So
 * at handoff the buyer scans the seller's QR (buyer's scan releases payment);
 * at a lend return the lender scans the borrower's QR.
 */

type TxStatus =
  | 'pending_payment'
  | 'escrow_held'
  | 'qr_issued'
  | 'in_use'
  | 'completed'
  | 'disputed'
  | 'refunded'
  | 'cancelled';

type Stage = 'handoff' | 'return';

export type TxRow = {
  id: string;
  listing_id: string;
  type: 'sell' | 'lend' | 'exchange';
  buyer_id: string;
  seller_id: string;
  agreed_price: number;
  status: TxStatus;
  meeting_location: string | null;
  chat_id: string | null;
  offer_id: string | null;
  payer_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export const TX_COLUMNS =
  'id, listing_id, type, buyer_id, seller_id, agreed_price, status, meeting_location, chat_id, offer_id, payer_id, created_at, updated_at, completed_at';

const ACTIVE: TxStatus[] = ['pending_payment', 'escrow_held', 'qr_issued', 'in_use', 'disputed'];
const CANCELLABLE: TxStatus[] = ['pending_payment', 'escrow_held', 'qr_issued'];
const DISPUTABLE: TxStatus[] = ['escrow_held', 'qr_issued', 'in_use'];

/** No 0/O or 1/I — the code is read aloud and typed by hand as a fallback. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const QR_TTL_MINUTES = 10;
const PHOTO_URL_TTL_SECONDS = 60 * 30;

function makeCode(length = 8): string {
  let code = '';
  for (let i = 0; i < length; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

function money(n: unknown): number {
  return Math.round(Number(n ?? 0) * 100) / 100;
}

/** Whole days between two YYYY-MM-DD dates; borrowing and returning the same day counts as one. */
export function lendDays(start: string, end: string): number {
  const ms = new Date(end.slice(0, 10)).getTime() - new Date(start.slice(0, 10)).getTime();
  return Math.max(1, Math.round(ms / 86_400_000));
}

/** How many billing units a lend period covers: days, or started weeks. */
export function lendUnits(days: number, unit: string | null): number {
  return unit === 'week' ? Math.ceil(days / 7) : days;
}

/** Who pays into escrow. Sell and Lend: the buyer. Exchange: whoever owes the top-up. */
export function payerOf(tx: { payer_id?: string | null; buyer_id: string }): string {
  return tx.payer_id ?? tx.buyer_id;
}

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);
  private readonly photoBucket = process.env.SUPABASE_CONDITION_PHOTO_BUCKET ?? 'condition-photos';

  constructor(
    private readonly notifications: NotificationsService,
    private readonly campus: CampusService,
  ) {}

  // ===========================================================================
  // helpers
  // ===========================================================================

  private async loadTx(txId: string): Promise<TxRow> {
    const { data, error } = await getSupabaseAdmin()
      .from('transactions')
      .select(TX_COLUMNS)
      .eq('id', txId)
      .single();
    if (error || !data) throw new NotFoundException('Deal not found');
    return data as TxRow;
  }

  /** Loads the deal and refuses anyone who is not the buyer or the seller. */
  private async loadForParty(txId: string, userId: string): Promise<TxRow> {
    const tx = await this.loadTx(txId);
    if (tx.buyer_id !== userId && tx.seller_id !== userId) {
      throw new ForbiddenException('This is not your deal');
    }
    return tx;
  }

  /** Which physical leg the deal is waiting on, if any. */
  private stageOf(tx: TxRow): Stage | null {
    if (tx.status === 'escrow_held' || tx.status === 'qr_issued') return 'handoff';
    if (tx.status === 'in_use') return 'return';
    return null;
  }

  /** The person handing the item over shows the QR; the receiver scans it. */
  private rolesFor(tx: TxRow, stage: Stage) {
    return stage === 'handoff'
      ? { giver: tx.seller_id, receiver: tx.buyer_id }
      : { giver: tx.buyer_id, receiver: tx.seller_id };
  }

  private async listingTitle(listingId: string): Promise<string> {
    const { data } = await getSupabaseAdmin()
      .from('listings')
      .select('title')
      .eq('id', listingId)
      .maybeSingle();
    return (data?.title as string) ?? 'your item';
  }

  private async setStatus(tx: TxRow, from: TxStatus[], to: TxStatus, extra: Record<string, unknown> = {}) {
    const { data, error } = await getSupabaseAdmin()
      .from('transactions')
      .update({ status: to, updated_at: new Date().toISOString(), ...extra })
      .eq('id', tx.id)
      .in('status', from)
      .select(TX_COLUMNS)
      .maybeSingle();

    if (error) throw new BadRequestException(error.message);
    // No row back means someone else moved the deal first (double tap, the
    // other party acting at the same moment). Refuse rather than double-apply.
    if (!data) throw new BadRequestException('This deal changed in the meantime — refresh and try again');
    return data as TxRow;
  }

  private async setListingStatus(listingId: string, status: string) {
    const { error } = await getSupabaseAdmin().from('listings').update({ status }).eq('id', listingId);
    if (error) this.logger.warn(`Listing ${listingId} → ${status} failed: ${error.message}`);
  }

  private async expireTokens(txId: string) {
    await getSupabaseAdmin()
      .from('qr_tokens')
      .update({ expires_at: new Date().toISOString() })
      .eq('transaction_id', txId)
      .eq('used', false);
  }

  private async escrowFor(txId: string) {
    const { data } = await getSupabaseAdmin()
      .from('escrow_holds')
      .select('id, transaction_id, amount, status, held_at, released_at, released_to_seller, refunded_to_buyer')
      .eq('transaction_id', txId)
      .maybeSingle();
    return data;
  }

  private async lendFor(txId: string) {
    const { data } = await getSupabaseAdmin()
      .from('lend_details')
      .select('transaction_id, start_date, end_date, deposit_amount, rent_per_day')
      .eq('transaction_id', txId)
      .maybeSingle();
    return data;
  }

  /**
   * Closes a held escrow in favour of the payee (the side that did NOT pay in).
   * Sell / Lend: the seller or lender. Exchange: whoever is owed the top-up.
   *
   *   normal        payee gets everything except a lend deposit, which goes back to the payer
   *   all_to_payee  payee gets everything (an admin found for them in a dispute)
   *
   * released_to_seller / refunded_to_buyer record how much ended up on each side.
   * Throws if the write fails, so a deal is never reported settled when it isn't.
   */
  async settle(tx: TxRow, mode: 'normal' | 'all_to_payee') {
    const escrow = await this.escrowFor(tx.id);
    if (!escrow || escrow.status !== 'held') return;

    const total = money(escrow.amount);
    const lend = tx.type === 'lend' ? await this.lendFor(tx.id) : null;
    const deposit = mode === 'normal' ? money(lend?.deposit_amount) : 0;
    const toPayee = money(total - deposit);
    const sellerPaid = payerOf(tx) === tx.seller_id;

    const { data, error } = await getSupabaseAdmin()
      .from('escrow_holds')
      .update({
        status: 'released',
        released_at: new Date().toISOString(),
        released_to_seller: sellerPaid ? deposit : toPayee,
        refunded_to_buyer: sellerPaid ? toPayee : deposit,
      })
      .eq('id', escrow.id)
      .eq('status', 'held')
      .select('id')
      .maybeSingle();
    if (error) {
      this.logger.error(`Escrow release failed for deal ${tx.id}: ${error.message}`);
      throw new BadRequestException('Could not release the escrow — please try again');
    }
    if (!data) this.logger.warn(`Escrow for deal ${tx.id} was already closed`);
  }

  /** Escrow → back to whoever paid it in, in full. */
  async refund(tx: TxRow) {
    const escrow = await this.escrowFor(tx.id);
    if (!escrow || escrow.status !== 'held') return false;

    const amount = money(escrow.amount);
    const sellerPaid = payerOf(tx) === tx.seller_id;
    const { data, error } = await getSupabaseAdmin()
      .from('escrow_holds')
      .update({
        status: 'refunded',
        released_at: new Date().toISOString(),
        released_to_seller: sellerPaid ? amount : 0,
        refunded_to_buyer: sellerPaid ? 0 : amount,
      })
      .eq('id', escrow.id)
      .eq('status', 'held')
      .select('id')
      .maybeSingle();
    if (error) {
      this.logger.error(`Escrow refund failed for deal ${tx.id}: ${error.message}`);
      throw new BadRequestException('Could not refund the escrow — please try again');
    }
    return !!data;
  }

  private async signPhotos(rows: { image_url: string }[]) {
    return Promise.all(
      rows.map(async (row) => {
        const { data } = await getSupabaseAdmin()
          .storage.from(this.photoBucket)
          .createSignedUrl(row.image_url, PHOTO_URL_TTL_SECONDS);
        return { ...row, url: data?.signedUrl ?? null };
      }),
    );
  }

  /** Has this person added at least one condition photo for this stage? */
  private async hasPhoto(txId: string, stage: Stage, userId: string) {
    const { count } = await getSupabaseAdmin()
      .from('condition_photos')
      .select('id', { count: 'exact', head: true })
      .eq('transaction_id', txId)
      .eq('stage', stage)
      .eq('uploaded_by', userId);
    return !!count;
  }

  async photosFor(txId: string) {
    const { data } = await getSupabaseAdmin()
      .from('condition_photos')
      .select('id, stage, image_url, uploaded_by, uploaded_at')
      .eq('transaction_id', txId)
      .order('uploaded_at', { ascending: true });
    return this.signPhotos((data ?? []) as { image_url: string }[]);
  }

  // ===========================================================================
  // 1. Seller finalises the deal with one buyer
  // ===========================================================================

  async create(userId: string, dto: CreateTransactionDto) {
    const supabase = getSupabaseAdmin();

    const { data: chat } = await supabase
      .from('chats')
      .select('id, listing_id, initiator_id, owner_id')
      .eq('id', dto.chat_id)
      .maybeSingle();
    if (!chat) throw new NotFoundException('Chat not found');
    if (chat.owner_id !== userId) {
      throw new ForbiddenException('Only the person who listed the item can finalise the deal');
    }

    const { data: listing } = await supabase
      .from('listings')
      .select('id, owner_id, type, title, status, meeting_location, rent_unit')
      .eq('id', chat.listing_id)
      .maybeSingle();
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.status !== 'live') {
      throw new BadRequestException('This listing is not available — it may already be reserved');
    }

    const { data: offer } = await supabase
      .from('offers')
      .select('id, offered_price, status, item_title, topup_payer')
      .eq('chat_id', chat.id)
      .eq('status', 'accepted')
      .maybeSingle();
    if (!offer) throw new BadRequestException('Agree a price in the chat before finalising');

    let agreedPrice = money(offer.offered_price);

    // The meeting point is settled together with the deal. It must be a real
    // campus place; the listing's own (possibly older) meeting point is always allowed.
    let meetingPoint: string | null = (listing.meeting_location as string | null) ?? null;
    if (dto.meeting_location !== undefined && dto.meeting_location.trim() !== meetingPoint) {
      const wanted = dto.meeting_location.trim();
      const place = (await this.campus.all()).find((p) => p.name === wanted);
      if (!place) throw new BadRequestException('Choose a meeting point from the campus list');
      meetingPoint = place.name;
    }
    if (!meetingPoint) throw new BadRequestException('Choose where you will meet');

    // Lend needs dates and a deposit before any money is held.
    let lendRow: Record<string, unknown> | null = null;
    if (listing.type === 'lend') {
      if (!dto.start_date || !dto.end_date) {
        throw new BadRequestException('A lend deal needs a start date and a return date');
      }
      const start = new Date(dto.start_date);
      const end = new Date(dto.end_date);
      const today = new Date(campusDay());
      if (start < today) throw new BadRequestException('The start date cannot be in the past');
      if (end < start) throw new BadRequestException('The return date must be on or after the start date');

      // The agreed offer is a RATE (per day or per week, as listed); the deal
      // stores the total rent for the whole period.
      const days = lendDays(dto.start_date, dto.end_date);
      const units = lendUnits(days, listing.rent_unit);
      agreedPrice = money(Number(offer.offered_price) * units);
      lendRow = {
        start_date: dto.start_date.slice(0, 10),
        end_date: dto.end_date.slice(0, 10),
        deposit_amount: money(dto.deposit_amount ?? 0),
        rent_per_day: money(agreedPrice / days),
      };
    }

    // Exchange: the top-up can flow either way; nothing to pay for a straight swap.
    let payerId: string = chat.initiator_id;
    if (listing.type === 'exchange') {
      if (!offer.item_title) throw new BadRequestException('Agree on the item being swapped before finalising');
      payerId = offer.topup_payer === 'owner' ? chat.owner_id : chat.initiator_id;
    }
    const straightSwap = listing.type === 'exchange' && agreedPrice === 0;

    const { data: tx, error } = await supabase
      .from('transactions')
      .insert({
        listing_id: listing.id,
        type: listing.type,
        buyer_id: chat.initiator_id,
        seller_id: chat.owner_id,
        agreed_price: agreedPrice,
        status: straightSwap ? 'escrow_held' : 'pending_payment',
        meeting_location: meetingPoint,
        chat_id: chat.id,
        offer_id: offer.id,
        payer_id: payerId,
      })
      .select(TX_COLUMNS)
      .single();

    if (error || !tx) {
      // 23505 = the "one active deal per listing" unique index.
      if (error?.code === '23505') {
        throw new BadRequestException('This listing already has a deal in progress');
      }
      throw new BadRequestException(error?.message ?? 'Could not create the deal');
    }

    if (lendRow) {
      const { error: lendError } = await supabase
        .from('lend_details')
        .insert({ transaction_id: tx.id, ...lendRow });
      if (lendError) {
        await supabase.from('transactions').delete().eq('id', tx.id);
        throw new BadRequestException(`Could not save the lend terms: ${lendError.message}`);
      }
    }

    // Reserve the listing so nobody else can start a deal on it.
    const { data: reserved } = await supabase
      .from('listings')
      .update({ status: 'reserved' })
      .eq('id', listing.id)
      .eq('status', 'live')
      .select('id')
      .maybeSingle();

    if (!reserved) {
      await supabase.from('transactions').delete().eq('id', tx.id);
      throw new BadRequestException('This listing was just reserved by another deal');
    }

    // A straight swap has nothing to pay, so it goes straight to the meetup.
    // A zero-amount hold keeps the escrow record consistent with every other deal.
    if (straightSwap) {
      await supabase.from('escrow_holds').insert({ transaction_id: tx.id, amount: 0, status: 'held' });
    }

    const body =
      listing.type === 'exchange'
        ? straightSwap
          ? `Your swap for "${listing.title}" is confirmed. Meet at the campus point to hand both items over.`
          : payerId === chat.initiator_id
            ? `Your swap for "${listing.title}" is confirmed. Pay the ₹${agreedPrice} top-up into escrow to continue.`
            : `Your swap for "${listing.title}" is confirmed. The owner will pay the ₹${agreedPrice} top-up into escrow.`
        : listing.type === 'lend'
          ? `"${listing.title}" is reserved for you: ₹${agreedPrice} rent for the period. Pay into escrow to continue.`
          : `"${listing.title}" is reserved for you at ₹${agreedPrice}. Pay into escrow to continue.`;
    await this.notifications.notify(chat.initiator_id, 'deal_created', {
      title: listing.type === 'exchange' ? 'Swap confirmed' : 'The seller chose you',
      body: `${body} Meeting point: ${meetingPoint}.`,
      transaction_id: tx.id,
      listing_id: listing.id,
    });

    return this.detail(tx.id, userId);
  }

  // ===========================================================================
  // reading
  // ===========================================================================

  async listMine(userId: string) {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('transactions')
      .select(TX_COLUMNS)
      .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
      .order('updated_at', { ascending: false })
      .limit(100);
    if (error) throw new BadRequestException(error.message);
    if (!data?.length) return [];

    const { data: listings } = await supabase
      .from('listings')
      .select('id, title, images, type')
      .in('id', [...new Set(data.map((t) => t.listing_id))]);
    const byId = new Map((listings ?? []).map((l) => [l.id, l]));

    return (data as TxRow[]).map((tx) => ({
      ...tx,
      my_role: tx.buyer_id === userId ? 'buyer' : 'seller',
      listing: byId.get(tx.listing_id) ?? null,
    }));
  }

  /** The latest deal created from a chat thread, so the chat can link to it. */
  async forChat(chatId: string, userId: string) {
    const supabase = getSupabaseAdmin();
    const { data: chat } = await supabase
      .from('chats')
      .select('id, initiator_id, owner_id')
      .eq('id', chatId)
      .maybeSingle();
    if (!chat) throw new NotFoundException('Chat not found');
    if (chat.initiator_id !== userId && chat.owner_id !== userId) {
      throw new ForbiddenException('Not your conversation');
    }

    const { data } = await supabase
      .from('transactions')
      .select('id, status')
      .eq('chat_id', chatId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    return { transaction: data ?? null };
  }

  /** Everything the deal screen needs in one call. */
  async detail(txId: string, userId: string) {
    const tx = await this.loadForParty(txId, userId);
    return this.buildDetail(tx, userId);
  }

  async buildDetail(tx: TxRow, viewerId: string | null) {
    const supabase = getSupabaseAdmin();
    const [listingRes, usersRes, escrow, lend, photos, disputeRes, offerRes] = await Promise.all([
      supabase
        .from('listings')
        .select('id, title, images, type, category, condition, status, rent_amount, rent_unit')
        .eq('id', tx.listing_id)
        .maybeSingle(),
      supabase.from('users').select('id, name, email').in('id', [tx.buyer_id, tx.seller_id]),
      this.escrowFor(tx.id),
      tx.type === 'lend' ? this.lendFor(tx.id) : Promise.resolve(null),
      this.photosFor(tx.id),
      supabase
        .from('disputes')
        .select('id, raised_by, reason, status, admin_note, resolution, outcome, penalty_amount, penalty_user_id, created_at, resolved_at')
        .eq('transaction_id', tx.id)
        .maybeSingle(),
      tx.offer_id
        ? supabase
            .from('offers')
            .select('offered_price, item_title, item_description, item_images, topup_payer')
            .eq('id', tx.offer_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    const people = new Map((usersRes.data ?? []).map((u) => [u.id, u]));
    const display = (id: string) => {
      const u = people.get(id) as { name?: string; email?: string } | undefined;
      // Show a name, or the part of the email before @ — never a roll number.
      return u?.name || u?.email?.split('@')[0] || 'Student';
    };

    const stage = this.stageOf(tx);
    const roles = stage ? this.rolesFor(tx, stage) : null;
    const offer = offerRes.data as {
      offered_price: number;
      item_title: string | null;
      item_description: string | null;
      item_images: string[] | null;
      topup_payer: string | null;
    } | null;
    const payer = payerOf(tx);
    const listingRow = listingRes.data as { rent_unit?: string | null } | null;
    const stagePhotos = stage ? photos.filter((p) => (p as { stage?: string }).stage === stage) : [];
    const photographed = (id: string | null) =>
      !!id && stagePhotos.some((p) => (p as { uploaded_by?: string }).uploaded_by === id);
    const otherParty = viewerId == null ? null : viewerId === tx.buyer_id ? tx.seller_id : tx.buyer_id;

    return {
      ...tx,
      payer_id: payer,
      /** true when the viewer is the one who pays into escrow. */
      i_pay: viewerId === payer,
      /** Exchange only — the item the other side put up for the swap. */
      exchange_item:
        tx.type === 'exchange' && offer?.item_title
          ? {
              title: offer.item_title,
              description: offer.item_description,
              images: offer.item_images ?? [],
            }
          : null,
      /** Lend only — the agreed rate the total was worked out from. */
      lend_rate:
        tx.type === 'lend' && offer
          ? { amount: money(offer.offered_price), unit: listingRow?.rent_unit ?? 'day' }
          : null,
      my_role: viewerId == null ? null : tx.buyer_id === viewerId ? 'buyer' : 'seller',
      buyer_name: display(tx.buyer_id),
      seller_name: display(tx.seller_id),
      listing: listingRes.data ?? null,
      escrow,
      lend,
      photos,
      dispute: disputeRes.data ?? null,
      stage,
      /** true when the viewer is the one who must SHOW the QR right now. */
      i_show_qr: !!roles && roles.giver === viewerId,
      /** true when the viewer is the one who must SCAN the QR right now. */
      i_scan_qr: !!roles && roles.receiver === viewerId,
      /**
       * Condition photos for the current stage. Each side must photograph the
       * item before the QR can be shown or scanned.
       */
      photo_status: stage
        ? { stage, mine: photographed(viewerId), theirs: photographed(otherParty) }
        : null,
    };
  }

  // ===========================================================================
  // 2. Buyer pays into (simulated) escrow
  // ===========================================================================

  async pay(txId: string, userId: string) {
    const tx = await this.loadForParty(txId, userId);
    if (payerOf(tx) !== userId) {
      throw new ForbiddenException(tx.type === 'exchange' ? 'The other side pays the top-up' : 'Only the buyer pays');
    }
    if (tx.status !== 'pending_payment') throw new BadRequestException('This deal is not waiting for payment');

    const lend = tx.type === 'lend' ? await this.lendFor(tx.id) : null;
    const amount = money(Number(tx.agreed_price) + Number(lend?.deposit_amount ?? 0));

    const { error } = await getSupabaseAdmin()
      .from('escrow_holds')
      .insert({ transaction_id: tx.id, amount, status: 'held' });
    // escrow_holds.transaction_id is unique, so a double tap cannot hold twice.
    if (error && error.code !== '23505') throw new BadRequestException(error.message);

    const updated = await this.setStatus(tx, ['pending_payment'], 'escrow_held');

    const otherSide = userId === tx.buyer_id ? tx.seller_id : tx.buyer_id;
    await this.notifications.notify(otherSide, 'payment_held', {
      title: 'Payment is in escrow',
      body:
        tx.type === 'exchange'
          ? `₹${amount} top-up is held for "${await this.listingTitle(tx.listing_id)}". Meet up and swap — the QR scan releases it.`
          : `₹${amount} is held for "${await this.listingTitle(tx.listing_id)}". Meet the buyer and show your QR at handoff.`,
      transaction_id: tx.id,
    });

    return this.buildDetail(updated, userId);
  }

  // ===========================================================================
  // 3. QR codes
  // ===========================================================================

  /** Issues a fresh single-use code to the person handing the item over. */
  async issueQr(txId: string, userId: string) {
    let tx = await this.loadForParty(txId, userId);
    const stage = this.stageOf(tx);
    if (!stage) throw new BadRequestException('There is no handoff to confirm for this deal right now');

    const { giver } = this.rolesFor(tx, stage);
    if (giver !== userId) {
      throw new ForbiddenException(
        stage === 'handoff'
          ? 'The seller shows the QR at handoff — you scan it'
          : 'The borrower shows the QR at return — you scan it',
      );
    }

    // Photograph first, then show the code: the item's condition is on record
    // from the side handing it over before anything is confirmed.
    if (!(await this.hasPhoto(tx.id, stage, userId))) {
      throw new BadRequestException('Add a condition photo of the item before showing your QR');
    }

    // Only one live code at a time: generating a new one kills the old.
    await this.expireTokens(tx.id);

    const code = makeCode();
    const expiresAt = new Date(Date.now() + QR_TTL_MINUTES * 60 * 1000).toISOString();
    const { error } = await getSupabaseAdmin()
      .from('qr_tokens')
      .insert({ transaction_id: tx.id, token: code, expires_at: expiresAt, used: false, purpose: stage });
    if (error) throw new BadRequestException(error.message);

    if (tx.status === 'escrow_held') tx = await this.setStatus(tx, ['escrow_held'], 'qr_issued');

    return {
      code,
      purpose: stage,
      expires_at: expiresAt,
      /** What the QR image encodes. Scanning it gives the receiver this string. */
      payload: `CX:${tx.id}:${code}`,
    };
  }

  // ===========================================================================
  // 4. Condition photos (evidence for disputes)
  // ===========================================================================

  async uploadPhoto(txId: string, userId: string, stage: Stage, file?: Express.Multer.File) {
    const tx = await this.loadForParty(txId, userId);
    if (!file) throw new BadRequestException('No photo provided');

    const allowed =
      tx.status === 'disputed' ||
      (stage === 'handoff' && (tx.status === 'escrow_held' || tx.status === 'qr_issued')) ||
      (stage === 'return' && tx.status === 'in_use');
    if (!allowed) throw new BadRequestException(`You can't add ${stage} photos at this stage of the deal`);

    const image = requireImage(file, 'Condition photos');

    const supabase = getSupabaseAdmin();
    const path = `${tx.id}/${stage}/${Date.now()}-${userId.slice(0, 8)}.${image.ext}`;
    const { error: uploadError } = await supabase.storage.from(this.photoBucket).upload(path, file.buffer, {
      contentType: image.mime,
      upsert: false,
    });
    if (uploadError) {
      this.logger.error(`Condition photo upload failed: ${uploadError.message}`);
      throw new BadRequestException(`Upload failed: ${uploadError.message}`);
    }

    const { data, error } = await supabase
      .from('condition_photos')
      .insert({ transaction_id: tx.id, stage, image_url: path, uploaded_by: userId })
      .select('id, stage, image_url, uploaded_by, uploaded_at')
      .single();
    if (error || !data) throw new BadRequestException(error?.message ?? 'Could not save the photo');

    return (await this.signPhotos([data]))[0];
  }

  // ===========================================================================
  // 5. Scan — the receiver confirms the physical handoff / return
  // ===========================================================================

  async scan(txId: string, userId: string, rawToken: string) {
    const tx = await this.loadForParty(txId, userId);
    const stage = this.stageOf(tx);
    if (!stage) throw new BadRequestException('There is nothing to confirm for this deal right now');

    const { receiver, giver } = this.rolesFor(tx, stage);
    if (receiver !== userId) {
      throw new ForbiddenException(
        stage === 'handoff' ? 'The buyer scans the QR at handoff' : 'The lender scans the QR at return',
      );
    }

    // Accept either the scanned payload "CX:<txId>:<CODE>" or the typed code.
    let code = rawToken.trim().toUpperCase();
    if (code.startsWith('CX:')) {
      const [, scannedTx, scannedCode] = rawToken.trim().split(':');
      if (scannedTx !== tx.id) throw new BadRequestException('That QR code belongs to a different deal');
      code = (scannedCode ?? '').toUpperCase();
    }

    const supabase = getSupabaseAdmin();

    // Condition photos are mandatory before the scan (proposal Section 4.2), and
    // the person confirming must have taken their own — not rely on the other side's.
    if (!(await this.hasPhoto(tx.id, stage, userId))) {
      throw new BadRequestException('Take at least one condition photo of the item before confirming');
    }

    const { data: token } = await supabase
      .from('qr_tokens')
      .select('id, expires_at, used, purpose')
      .eq('transaction_id', tx.id)
      .eq('token', code)
      .maybeSingle();

    if (!token) throw new BadRequestException('That code is not valid for this deal');
    if (token.used) throw new BadRequestException('That code has already been used');
    if (token.purpose !== stage) throw new BadRequestException('That code is for a different step of this deal');
    if (new Date(token.expires_at as string).getTime() < Date.now()) {
      throw new BadRequestException('That code has expired — ask them to show a fresh one');
    }

    // Single use, enforced by the conditional update.
    const { data: consumed } = await supabase
      .from('qr_tokens')
      .update({ used: true, used_at: new Date().toISOString() })
      .eq('id', token.id)
      .eq('used', false)
      .select('id')
      .maybeSingle();
    if (!consumed) throw new BadRequestException('That code has already been used');

    const title = await this.listingTitle(tx.listing_id);
    const now = new Date().toISOString();

    // If anything below fails, put the deal and the code back exactly as they
    // were, so the people at the meetup can simply scan again.
    const restoreToken = () =>
      supabase.from('qr_tokens').update({ used: false, used_at: null }).eq('id', token.id);
    const move = async (from: TxStatus[], to: TxStatus, extra: Record<string, unknown> = {}) => {
      try {
        return await this.setStatus(tx, from, to, extra);
      } catch (e) {
        await restoreToken();
        throw e;
      }
    };
    const moveAndSettle = async (from: TxStatus[]) => {
      const updated = await move(from, 'completed', { completed_at: now });
      try {
        await this.settle(tx, 'normal');
      } catch (e) {
        await supabase
          .from('transactions')
          .update({ status: tx.status, completed_at: null, updated_at: new Date().toISOString() })
          .eq('id', tx.id)
          .eq('status', 'completed');
        await restoreToken();
        throw e;
      }
      return updated;
    };

    if (stage === 'handoff' && tx.type === 'lend') {
      const updated = await move(['escrow_held', 'qr_issued'], 'in_use');
      await this.notifications.notifyMany([giver, receiver], 'handoff_complete', {
        title: 'Handoff confirmed',
        body: `"${title}" is now with the borrower. Escrow stays held until it is returned.`,
        transaction_id: tx.id,
      });
      return this.buildDetail(updated, userId);
    }

    if (stage === 'handoff') {
      const updated = await moveAndSettle(['escrow_held', 'qr_issued']);
      await this.setListingStatus(tx.listing_id, 'completed');
      const escrowLine =
        tx.type !== 'exchange'
          ? 'Escrow released to the seller.'
          : Number(tx.agreed_price) > 0
            ? 'Swap done and the top-up released.'
            : 'Swap done.';
      await this.notifications.notifyMany([giver, receiver], 'handoff_complete', {
        title: 'Deal complete',
        body: `Handoff of "${title}" confirmed. ${escrowLine}`,
        transaction_id: tx.id,
      });
      return this.buildDetail(updated, userId);
    }

    // stage === 'return' (lend only)
    const updated = await moveAndSettle(['in_use']);
    // The lender has their item back, so it can be lent out again.
    await this.setListingStatus(tx.listing_id, 'live');
    await this.notifications.notifyMany([giver, receiver], 'item_returned', {
      title: 'Item returned',
      body: `"${title}" is back with the lender. Rent released and the deposit refunded.`,
      transaction_id: tx.id,
    });
    return this.buildDetail(updated, userId);
  }

  // ===========================================================================
  // 6. Cancel before handoff
  // ===========================================================================

  async cancel(txId: string, userId: string) {
    const tx = await this.loadForParty(txId, userId);
    const { updated, refunded } = await this.closeBeforeHandoff(tx, true);

    const other = userId === tx.buyer_id ? tx.seller_id : tx.buyer_id;
    await this.notifications.notify(other, 'deal_cancelled', {
      title: 'Deal cancelled',
      body: `The deal for "${await this.listingTitle(tx.listing_id)}" was called off${refunded ? ' and the escrow refunded' : ''}.`,
      transaction_id: tx.id,
    });

    return this.buildDetail(updated, userId);
  }

  /** Deals on a listing that are still in progress (used when an admin takes it down). */
  async activeDealsFor(listingId: string): Promise<TxRow[]> {
    const { data, error } = await getSupabaseAdmin()
      .from('transactions')
      .select(TX_COLUMNS)
      .eq('listing_id', listingId)
      .in('status', ACTIVE);
    if (error) throw new BadRequestException(error.message);
    return (data ?? []) as TxRow[];
  }

  /** True when the deal has not reached the handoff, so it can still be called off. */
  static canCloseBeforeHandoff(tx: TxRow): boolean {
    return CANCELLABLE.includes(tx.status);
  }

  /**
   * An admin took the listing down: call off a deal that has not reached the
   * handoff and refund any money held. Both people are told why.
   */
  async cancelForTakedown(tx: TxRow, reason: string) {
    const { refunded } = await this.closeBeforeHandoff(tx, false);
    await this.notifications.notifyMany([tx.buyer_id, tx.seller_id], 'deal_cancelled', {
      title: 'Deal cancelled by an admin',
      body: `"${await this.listingTitle(tx.listing_id)}" was taken down (${reason}), so the deal was called off${refunded ? ' and the money refunded' : ''}.`,
      transaction_id: tx.id,
    });
  }

  /**
   * Calls off a deal before the handoff: refunds any money held (or closes a
   * ₹0 swap hold), kills the QR codes and, if `relist`, puts the item back live.
   */
  private async closeBeforeHandoff(tx: TxRow, relist: boolean) {
    if (!CANCELLABLE.includes(tx.status)) {
      throw new BadRequestException('A deal can only be cancelled before the handoff');
    }

    // Move the deal first (the conditional update wins any race), then the money.
    const escrow = await this.escrowFor(tx.id);
    const held = escrow?.status === 'held';
    // A straight swap holds ₹0 — closing it is bookkeeping, not a refund.
    const paid = held && Number(escrow?.amount ?? 0) > 0;
    const updated = await this.setStatus(tx, CANCELLABLE, paid ? 'refunded' : 'cancelled');
    let refunded = false;
    if (held && !paid) await this.refund(tx).catch(() => undefined);
    if (paid) {
      try {
        refunded = await this.refund(tx);
      } catch (e) {
        // Undo the status change so the deal doesn't read "refunded" with money still held.
        await getSupabaseAdmin()
          .from('transactions')
          .update({ status: tx.status, updated_at: new Date().toISOString() })
          .eq('id', tx.id)
          .eq('status', 'refunded');
        throw e;
      }
    }
    await this.expireTokens(tx.id);

    // Put the item back on the feed (a taken-down listing stays off: migration 011).
    if (relist) {
      await getSupabaseAdmin()
        .from('listings')
        .update({ status: 'live' })
        .eq('id', tx.listing_id)
        .eq('status', 'reserved');
    }

    return { updated, refunded };
  }

  // ===========================================================================
  // 7. Raise a dispute (admin side lives in DisputesService)
  // ===========================================================================

  async raiseDispute(txId: string, userId: string, reason: string) {
    const tx = await this.loadForParty(txId, userId);
    if (!DISPUTABLE.includes(tx.status)) {
      throw new BadRequestException('You can only report a problem while the deal is in progress');
    }

    const { data: dispute, error } = await getSupabaseAdmin()
      .from('disputes')
      .insert({
        transaction_id: tx.id,
        raised_by: userId,
        reason,
        status: 'open',
        transaction_status_before: tx.status,
      })
      .select('id')
      .single();

    if (error || !dispute) {
      if (error?.code === '23505') throw new BadRequestException('A dispute is already open for this deal');
      throw new BadRequestException(error?.message ?? 'Could not open the dispute');
    }

    // Freezes the deal: no scans, no cancellation, escrow stays held.
    const updated = await this.setStatus(tx, DISPUTABLE, 'disputed');
    await this.expireTokens(tx.id);

    const title = await this.listingTitle(tx.listing_id);
    const other = userId === tx.buyer_id ? tx.seller_id : tx.buyer_id;
    await this.notifications.notify(other, 'dispute_opened', {
      title: 'A problem was reported',
      body: `The other party reported an issue with "${title}". Escrow is frozen until an admin decides. Add any photos you have.`,
      transaction_id: tx.id,
      dispute_id: dispute.id,
    });
    await this.notifications.notifyAdmins('dispute_opened', {
      title: 'New dispute to review',
      body: `"${title}": ${reason.slice(0, 80)}`,
      transaction_id: tx.id,
      dispute_id: dispute.id,
    });

    return this.buildDetail(updated, userId);
  }

  /** Statuses that count as "still in progress" for the UI. */
  static readonly ACTIVE = ACTIVE;
}
