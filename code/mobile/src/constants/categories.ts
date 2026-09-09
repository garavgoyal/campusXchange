/** `listings.category` is free text in the schema; these are the seeded options. */
export const CATEGORIES = [
  'Textbooks',
  'Electronics',
  'Lab & Drafter',
  'Cycle & Commute',
  'Sports Gear',
  'Stationery',
] as const;

/** Maps to the `listing_type` enum — keys must stay sell/lend/exchange. */
export const LISTING_MODES = [
  { key: 'sell', label: 'Buy & Sell', icon: 'pricetag' },
  { key: 'lend', label: 'Lend / Rent', icon: 'repeat' },
  { key: 'exchange', label: 'Barter', icon: 'swap-horizontal' },
] as const;

/** Stored in `listings.condition`. Presets keep the values consistent. */
export const CONDITIONS = ['Like New', 'Good', 'Fair'] as const;

/**
 * Pre-seeded on-campus meetup points — the proposal's Section 4.3 approach,
 * chosen over GPS so no location permission is ever needed.
 */
export const MEETING_LOCATIONS = [
  'Library Foyer',
  'Hostel Block A',
  'Hostel Block B',
  'Hostel Block C',
  'Hostel Block D',
  'Academic Block A',
  'Academic Block B',
  'Sports Complex',
  'Main Gate',
  'Cafeteria',
] as const;
