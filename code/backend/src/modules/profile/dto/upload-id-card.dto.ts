/** Response returned after a successful ID card upload. */
export class UploadIdCardResponseDto {
  ok: boolean;
  path: string;
  id_verified: 'pending';
}

/** Shape of GET /profile/me — mirrors the public.users row. */
export class ProfileMeDto {
  id: string;
  name: string;
  email: string;
  roll_number: string | null;
  id_card_image_url: string | null;
  id_verified: 'pending' | 'verified' | 'rejected';
  role: 'student' | 'admin';
}
