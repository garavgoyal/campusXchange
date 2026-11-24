export type ReportReason = 'prohibited' | 'scam' | 'fake' | 'wrong_info' | 'offensive' | 'other';

/** What students pick from when reporting (same keys as the backend). */
export const REPORT_REASONS: { key: ReportReason; label: string }[] = [
  { key: 'scam', label: 'Scam or fraud' },
  { key: 'fake', label: 'Fake or misleading' },
  { key: 'prohibited', label: 'Prohibited item' },
  { key: 'wrong_info', label: 'Wrong details' },
  { key: 'offensive', label: 'Offensive' },
  { key: 'other', label: 'Something else' },
];

export type ReportTarget = { listing_id: string } | { user_id: string };

type Person = { id: string; name: string; email: string; penalty_total: number } | null;

/** GET /admin/reports */
export type AdminReport = {
  id: string;
  reporter_id: string;
  listing_id: string | null;
  listing_title: string | null;
  reported_user_id: string | null;
  reason: ReportReason;
  reason_label: string;
  details: string | null;
  created_at: string;
  reporter: Person;
  reported_user: Person;
  open_reports_on_target: number;
  listing: {
    id: string;
    title: string;
    type: string;
    status: string;
    images: string[] | null;
    price: number | null;
    rent_amount: number | null;
    rent_unit: string | null;
    owner: Person;
  } | null;
};

export type TakedownResult = {
  id: string;
  status: 'removed';
  cancelled_deals: number;
  open_deals: number;
  reports_closed: number;
};
