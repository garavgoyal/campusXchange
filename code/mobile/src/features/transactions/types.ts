/** Mirrors the `transactions` table plus what GET /transactions/:id joins in. */

export type TransactionStatus =
  | 'pending_payment'
  | 'escrow_held'
  | 'qr_issued'
  | 'in_use'
  | 'completed'
  | 'disputed'
  | 'refunded'
  | 'cancelled';

export type PhotoStage = 'handoff' | 'return';

export type DealListing = {
  id: string;
  title: string;
  images: string[];
  type: 'sell' | 'lend' | 'exchange';
  category?: string;
  condition?: string | null;
  status?: string;
};

export type ConditionPhoto = {
  id: string;
  stage: PhotoStage;
  image_url: string;
  uploaded_by: string;
  uploaded_at: string;
  /** Short-lived signed URL — the bucket is private. */
  url: string | null;
};

export type Escrow = {
  id: string;
  amount: number;
  status: 'held' | 'released' | 'refunded';
  held_at: string;
  released_at: string | null;
  released_to_seller: number | null;
  refunded_to_buyer: number | null;
};

export type LendTerms = {
  start_date: string;
  end_date: string;
  deposit_amount: number | null;
  rent_per_day: number | null;
};

export type Dispute = {
  id: string;
  raised_by: string;
  reason: string;
  status: 'open' | 'under_review' | 'resolved';
  admin_note: string | null;
  resolution: string | null;
  outcome: 'release' | 'refund' | null;
  penalty_amount: number | null;
  penalty_user_id: string | null;
  created_at: string;
  resolved_at: string | null;
};

export type DealSummary = {
  id: string;
  listing_id: string;
  type: 'sell' | 'lend' | 'exchange';
  buyer_id: string;
  seller_id: string;
  agreed_price: number;
  status: TransactionStatus;
  meeting_location: string | null;
  chat_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  my_role: 'buyer' | 'seller' | null;
  listing: DealListing | null;
};

export type Deal = DealSummary & {
  buyer_name: string;
  seller_name: string;
  escrow: Escrow | null;
  lend: LendTerms | null;
  photos: ConditionPhoto[];
  dispute: Dispute | null;
  stage: PhotoStage | null;
  i_show_qr: boolean;
  i_scan_qr: boolean;
};

export type QrTicket = {
  code: string;
  purpose: PhotoStage;
  expires_at: string;
  payload: string;
};

export type CreateDealInput = {
  chat_id: string;
  start_date?: string;
  end_date?: string;
  deposit_amount?: number;
};

export type AdminDispute = Dispute & {
  transaction_id: string;
  raised_by_role: 'buyer' | 'seller' | null;
  transaction_status_before: string | null;
  deal: Deal | null;
};

/** Plain-language status, shown on cards and the deal screen. */
export const STATUS_LABEL: Record<TransactionStatus, string> = {
  pending_payment: 'Awaiting payment',
  escrow_held: 'Paid · meet to hand over',
  qr_issued: 'Paid · meet to hand over',
  in_use: 'With borrower',
  completed: 'Completed',
  disputed: 'In dispute',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
};

export const ACTIVE_STATUSES: TransactionStatus[] = [
  'pending_payment',
  'escrow_held',
  'qr_issued',
  'in_use',
  'disputed',
];
