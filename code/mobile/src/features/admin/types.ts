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
