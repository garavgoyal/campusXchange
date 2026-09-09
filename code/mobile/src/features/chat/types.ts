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
  offered_price: number;
  status: OfferStatus;
  created_at: string;
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
