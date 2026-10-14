import { randomInt } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { getSupabaseAdmin } from '../../database/supabase.client.js';
import { NotificationsService } from '../notifications/notifications.service.js';
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

type TxRow = {
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
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

const TX_COLUMNS =
  'id, listing_id, type, buyer_id, seller_id, agreed_price, status, meeting_location, chat_id, offer_id, created_at, updated_at, completed_at';

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

@Injectable()
export class TransactionsService {
  private readonly logger = new Logger(TransactionsService.name);
  private readonly photoBucket = process.env.SUPABASE_CONDITION_PHOTO_BUCKET ?? 'condition-photos';

  constructor(private readonly notifications: NotificationsService) {}

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

  /** Escrow → seller. For a lend deal the deposit goes back to the borrower. */
  async settle(tx: TxRow, mode: 'normal' | 'all_to_seller') {
    const escrow = await this.escrowFor(tx.id);
    if (!escrow || escrow.status !== 'held') return;

    const total = money(escrow.amount);
    const lend = tx.type === 'lend' ? await this.lendFor(tx.id) : null;
    const deposit = mode === 'normal' ? money(lend?.deposit_amount) : 0;

    await getSupabaseAdmin()
      .from('escrow_holds')
      .update({
        status: 'released',
        released_at: new Date().toISOString(),
        released_to_seller: money(total - deposit),
        refunded_to_buyer: deposit,
      })
      .eq('id', escrow.id)
      .eq('status', 'held');
  }

  /** Escrow → back to the buyer in full. */
  async refund(txId: string) {
    const escrow = await this.escrowFor(txId);
    if (!escrow || escrow.status !== 'held') return false;

    await getSupabaseAdmin()
      .from('escrow_holds')
      .update({
        status: 'refunded',
        released_at: new Date().toISOString(),
        released_to_seller: 0,
        refunded_to_buyer: money(escrow.amount),
      })
      .eq('id', escrow.id)
      .eq('status', 'held');
    return true;
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
      .select('id, owner_id, type, title, status, meeting_location')
      .eq('id', chat.listing_id)
      .maybeSingle();
    if (!listing) throw new NotFoundException('Listing not found');
    if (listing.status !== 'live') {
      throw new BadRequestException('This listing is not available — it may already be reserved');
    }

    const { data: offer } = await supabase
      .from('offers')
      .select('id, offered_price, status')
      .eq('chat_id', chat.id)
      .eq('status', 'accepted')
      .maybeSingle();
    if (!offer) throw new BadRequestException('Agree a price in the chat before finalising');

    // Lend needs dates and a deposit before any money is held.
    let lendRow: Record<string, unknown> | null = null;
    if (listing.type === 'lend') {
      if (!dto.start_date || !dto.end_date) {
        throw new BadRequestException('A lend deal needs a start date and a return date');
      }
      const start = new Date(dto.start_date);
      const end = new Date(dto.end_date);
      const today = new Date(new Date().toISOString().slice(0, 10));
      if (start < today) throw new BadRequestException('The start date cannot be in the past');
      if (end < start) throw new BadRequestException('The return date must be on or after the start date');

      const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
      lendRow = {
        start_date: dto.start_date.slice(0, 10),
        end_date: dto.end_date.slice(0, 10),
        deposit_amount: money(dto.deposit_amount ?? 0),
        rent_per_day: money(Number(offer.offered_price) / days),
      };
    }

    const { data: tx, error } = await supabase
      .from('transactions')
      .insert({
        listing_id: listing.id,
        type: listing.type,
        buyer_id: chat.initiator_id,
        seller_id: chat.owner_id,
        agreed_price: offer.offered_price,
        status: 'pending_payment',
        meeting_location: listing.meeting_location,
        chat_id: chat.id,
        offer_id: offer.id,
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

    await this.notifications.notify(chat.initiator_id, 'deal_created', {
      title: 'The seller chose you',
      body: `"${listing.title}" is reserved for you at ₹${offer.offered_price}. Pay into escrow to continue.`,
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
    const [listingRes, usersRes, escrow, lend, photos, disputeRes] = await Promise.all([
      supabase
        .from('listings')
        .select('id, title, images, type, category, condition, status')
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
    ]);

    const people = new Map((usersRes.data ?? []).map((u) => [u.id, u]));
    const display = (id: string) => {
      const u = people.get(id) as { name?: string; email?: string } | undefined;
      // Show a name, or the part of the email before @ — never a roll number.
      return u?.name || u?.email?.split('@')[0] || 'Student';
    };

    const stage = this.stageOf(tx);
    const roles = stage ? this.rolesFor(tx, stage) : null;

    return {
      ...tx,
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
    };
  }

  // ===========================================================================
  // 2. Buyer pays into (simulated) escrow
  // ===========================================================================

  async pay(txId: string, userId: string) {
    const tx = await this.loadForParty(txId, userId);
    if (tx.buyer_id !== userId) throw new ForbiddenException('Only the buyer pays');
    if (tx.status !== 'pending_payment') throw new BadRequestException('This deal is not waiting for payment');

    const lend = tx.type === 'lend' ? await this.lendFor(tx.id) : null;
    const amount = money(Number(tx.agreed_price) + Number(lend?.deposit_amount ?? 0));

    const { error } = await getSupabaseAdmin()
      .from('escrow_holds')
      .insert({ transaction_id: tx.id, amount, status: 'held' });
    // escrow_holds.transaction_id is unique, so a double tap cannot hold twice.
    if (error && error.code !== '23505') throw new BadRequestException(error.message);

    const updated = await this.setStatus(tx, ['pending_payment'], 'escrow_held');

    await this.notifications.notify(tx.seller_id, 'payment_held', {
      title: 'Payment is in escrow',
      body: `₹${amount} is held for "${await this.listingTitle(tx.listing_id)}". Meet the buyer and show your QR at handoff.`,
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

    const extension = file.originalname?.split('.').pop()?.toLowerCase() || 'jpg';
    const isImage =
      file.mimetype?.startsWith('image/') || ['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp'].includes(extension);
    if (!isImage) throw new BadRequestException('Condition photos must be images');
    if (file.size > 8 * 1024 * 1024) throw new BadRequestException('Image is larger than 8 MB');

    const supabase = getSupabaseAdmin();
    const path = `${tx.id}/${stage}/${Date.now()}-${userId.slice(0, 8)}.${extension}`;
    const { error: uploadError } = await supabase.storage.from(this.photoBucket).upload(path, file.buffer, {
      contentType: file.mimetype?.startsWith('image/') ? file.mimetype : `image/${extension === 'jpg' ? 'jpeg' : extension}`,
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

    // Condition photos are mandatory before the scan (proposal Section 4.2).
    const { count: photoCount } = await supabase
      .from('condition_photos')
      .select('id', { count: 'exact', head: true })
      .eq('transaction_id', tx.id)
      .eq('stage', stage);
    if (!photoCount) {
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

    if (stage === 'handoff' && tx.type === 'lend') {
      const updated = await this.setStatus(tx, ['escrow_held', 'qr_issued'], 'in_use');
      await this.notifications.notifyMany([giver, receiver], 'handoff_complete', {
        title: 'Handoff confirmed',
        body: `"${title}" is now with the borrower. Escrow stays held until it is returned.`,
        transaction_id: tx.id,
      });
      return this.buildDetail(updated, userId);
    }

    if (stage === 'handoff') {
      const updated = await this.setStatus(tx, ['escrow_held', 'qr_issued'], 'completed', { completed_at: now });
      await this.settle(tx, 'normal');
      await this.setListingStatus(tx.listing_id, 'completed');
      await this.notifications.notifyMany([giver, receiver], 'handoff_complete', {
        title: 'Deal complete',
        body: `Handoff of "${title}" confirmed. Escrow released to the seller.`,
        transaction_id: tx.id,
      });
      return this.buildDetail(updated, userId);
    }

    // stage === 'return' (lend only)
    const updated = await this.setStatus(tx, ['in_use'], 'completed', { completed_at: now });
    await this.settle(tx, 'normal');
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
    if (!CANCELLABLE.includes(tx.status)) {
      throw new BadRequestException('A deal can only be cancelled before the handoff');
    }

    // Move the deal first (the conditional update wins any race), then the money.
    const escrow = await this.escrowFor(tx.id);
    const paid = escrow?.status === 'held';
    const updated = await this.setStatus(tx, CANCELLABLE, paid ? 'refunded' : 'cancelled');
    const refunded = paid ? await this.refund(tx.id) : false;
    await this.expireTokens(tx.id);

    // Put the item back on the feed.
    await getSupabaseAdmin()
      .from('listings')
      .update({ status: 'live' })
      .eq('id', tx.listing_id)
      .eq('status', 'reserved');

    const other = userId === tx.buyer_id ? tx.seller_id : tx.buyer_id;
    await this.notifications.notify(other, 'deal_cancelled', {
      title: 'Deal cancelled',
      body: `The deal for "${await this.listingTitle(tx.listing_id)}" was called off${refunded ? ' and the escrow refunded' : ''}.`,
      transaction_id: tx.id,
    });

    return this.buildDetail(updated, userId);
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
