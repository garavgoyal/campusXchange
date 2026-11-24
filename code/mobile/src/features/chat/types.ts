export type ChatMessage = {
  id: string;
  chat_id: string;
  sender_id: string;
  content: string;
  sent_at: string;
};

export type OfferStatus = 'pending' | 'accepted' | 'rejected';

export type Offer = {
  id: string;
  chat_id: string;
  sender_id: string | null;
  /** Sell: the price · Lend: the rate per day/week · Exchange: the cash top-up (0 = straight swap). */
  offered_price: number;
  status: OfferStatus;
  created_at: string;
  /** Exchange only — the item the person asking to swap is putting up. */
  item_title?: string | null;
  item_description?: string | null;
  item_images?: string[] | null;
  /** Exchange only — who adds the top-up: the chat initiator or the listing owner. */
  topup_payer?: 'initiator' | 'owner' | null;
};

export type OfferInput = {
  offered_price: number;
  item_title?: string;
  item_description?: string;
  item_images?: string[];
  topup_payer?: 'initiator' | 'owner';
};

/** Messages and offers merged into one timeline, ordered by time. */
export type ThreadEntry =
  | { kind: 'message'; at: string; message: ChatMessage }
  | { kind: 'offer'; at: string; offer: Offer };

export type ChatThread = {
  id: string;
  listing_id: string;
  initiator_id: string;
  owner_id: string;
  created_at: string;
  listing: {
    id: string;
    title: string;
    images: string[];
    type: string;
    price: number | null;
    rent_amount: number | null;
    rent_unit: string | null;
  } | null;
  last_message: { content: string; sent_at: string; sender_id: string } | null;
};
