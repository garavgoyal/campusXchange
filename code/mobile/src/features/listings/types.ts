/** Mirrors the `listings` table in database-schema.sql. */

export type ListingType = 'sell' | 'lend' | 'exchange';
export type RentUnit = 'day' | 'week';
export type ListingStatus =
  | 'draft'
  | 'pending_review'
  | 'live'
  | 'reserved'
  | 'completed'
  | 'removed';

export type Listing = {
  id: string;
  owner_id: string;
  type: ListingType;
  title: string;
  description: string | null;
  images: string[];
  category: string;
  condition: string | null;
  price: number | null;
  rent_amount: number | null;
  rent_unit: RentUnit | null;
  want_tags: string[] | null;
  meeting_location: string | null;
  status: ListingStatus;
  /** Set when an admin took the listing down (only the owner sees it). */
  taken_down_reason?: string | null;
  created_at: string;
  /** Set by the backend when a guest is browsing — location withheld, not absent. */
  location_hidden?: boolean;
  /** Only from GET /listings/:id/matches: which of the exchange's want-tags this item fits. */
  matched_tags?: string[];
  /** Metres from your hostel to the meeting point; only when you've set a hostel and the spot is on the map. */
  distance_m?: number | null;
};

export type ListingQuery = {
  type: ListingType;
  category?: string;
  search?: string;
  /** 'nearest' orders by distance from your hostel (needs a hostel set on your profile). */
  sort?: 'newest' | 'nearest';
};

export type CreateListingInput = {
  type: ListingType;
  title: string;
  description?: string;
  category: string;
  condition?: string;
  price?: number;
  rent_amount?: number;
  rent_unit?: RentUnit;
  want_tags?: string[];
  meeting_location?: string;
  images?: string[];
};
