import type { Listing } from '../listings/types';

export type ModerationItem = {
  queue_id: string;
  ai_flag_score: number | null;
  listing: Listing;
};

export type IdVerificationItem = {
  id: string;
  name: string;
  email: string;
  roll_number: string | null;
  id_card_image_url: string | null;
  id_verified: 'pending' | 'verified' | 'rejected';
  created_at: string;
  /** Short-lived signed URL — the bucket itself is private. */
  signed_url: string | null;
};

/** GET /admin/stats — platform analytics. */
export type AdminStats = {
  clearance: {
    window_days: number;
    reviewed: number;
    median_minutes: number | null;
    p90_minutes: number | null;
    average_minutes: number | null;
    within_24h_percent: number | null;
    approval_rate_percent: number | null;
  };
  queue: { pending: number; oldest_waiting_minutes: number | null };
  listings_by_status: Record<string, number>;
  listings_by_type: Record<string, number>;
  deals_by_status: Record<string, number>;
  disputes_by_status: Record<string, number>;
  /** Open student reports (0 before migration 011). */
  reports_open?: number;
  users_by_verification: Record<string, number>;
  /** Proposal §6.2 metrics; rates are null while there's nothing to divide by. */
  deals?: {
    total: number;
    ended: number;
    completed: number;
    completion_rate_percent: number | null;
    lend: number;
    lend_share_percent: number | null;
    lend_due: number;
    lend_returned_on_time: number;
    on_time_return_percent: number | null;
    disputed: number;
    dispute_rate_percent: number | null;
    lend_disputed: number;
    lend_dispute_rate_percent: number | null;
  };
};
