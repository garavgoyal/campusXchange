export type IdVerificationStatus = 'pending' | 'verified' | 'rejected';

/** Mirrors the public.users row (see database-schema.sql). */
export type ProfileMe = {
  id: string;
  name: string;
  email: string;
  roll_number: string | null;
  id_card_image_url: string | null;
  id_verified: IdVerificationStatus;
  role: 'student' | 'admin';
  /** Chosen on the Profile screen; orders the feed by nearest meeting point. */
  hostel: string | null;
};

export type UploadIdCardResult = { error: string | null };
