import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { getSupabaseAdmin } from '../../database/supabase.client.js';
import { CampusService } from '../campus/campus.service.js';
import { requireImage } from '../../common/uploads/image-file.js';

const ROLL_TAKEN =
  'This roll number is already registered to another account. Check it, or contact an admin if it is yours.';
import type { ProfileMeDto, UploadIdCardResponseDto } from './dto/upload-id-card.dto.js';

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);
  private readonly bucket = process.env.SUPABASE_ID_CARD_BUCKET ?? 'id-cards';

  constructor(private readonly campus: CampusService) {}

  /**
   * Stores the student's ID card photo in the private `id-cards` bucket and
   * records it on their profile as awaiting manual admin review.
   */
  async uploadIdCard(
    userId: string,
    file?: Express.Multer.File,
  ): Promise<UploadIdCardResponseDto> {
    // Type and extension come from the file's bytes, not from what the client claims.
    const image = requireImage(file, 'ID card photos');

    const supabase = getSupabaseAdmin();
    // Namespaced by user id so one student can never overwrite another's file.
    const path = `${userId}/${Date.now()}.${image.ext}`;

    const { error: uploadError } = await supabase.storage
      .from(this.bucket)
      .upload(path, file!.buffer, { contentType: image.mime, upsert: false });

    if (uploadError) {
      this.logger.error(`Storage upload failed for ${userId}: ${uploadError.message}`);
      throw new BadRequestException(`Upload failed: ${uploadError.message}`);
    }

    const { error: updateError } = await supabase
      .from('users')
      .update({ id_card_image_url: path, id_verified: 'pending' })
      .eq('id', userId);

    if (updateError) {
      this.logger.error(`Profile update failed for ${userId}: ${updateError.message}`);
      throw new BadRequestException(`Saving your profile failed: ${updateError.message}`);
    }

    return { ok: true, path, id_verified: 'pending' };
  }

  /**
   * Saves profile fields: name and roll number (collected at signup) and the
   * student's hostel (chosen or changed any time on the Profile screen).
   * The hostel must be one of the real hostels in campus_locations; there is
   * nothing else to verify, because it only changes the order of your own feed.
   */
  async updateProfile(
    userId: string,
    patch: { name?: string; roll_number?: string; hostel?: string | null },
  ) {
    const update: Record<string, string | null> = {};
    if (patch.name !== undefined) update.name = patch.name.trim();
    if (patch.roll_number !== undefined) {
      const roll = patch.roll_number.trim();
      // One account per roll number (migration 010 enforces it in the database too).
      const { data: taken } = await getSupabaseAdmin()
        .from('users')
        .select('id')
        .eq('roll_number', roll)
        .neq('id', userId)
        .limit(1)
        .maybeSingle();
      if (taken) throw new BadRequestException(ROLL_TAKEN);
      update.roll_number = roll;
    }
    if (patch.hostel !== undefined) {
      if (patch.hostel === null || patch.hostel === '') {
        update.hostel = null;
      } else {
        const hostel = await this.campus.hostel(patch.hostel);
        if (!hostel) throw new BadRequestException('Choose a hostel from the list');
        update.hostel = hostel.name;
      }
    }

    if (Object.keys(update).length === 0) {
      throw new BadRequestException('Nothing to update');
    }

    const { data, error } = await getSupabaseAdmin()
      .from('users')
      .update(update)
      .eq('id', userId)
      .select('id, name, roll_number, hostel')
      .single();

    if (error || !data) {
      // 23505 = unique index (two people saving the same roll number at once).
      if (error?.code === '23505') throw new BadRequestException(ROLL_TAKEN);
      this.logger.error(`Profile update failed for ${userId}: ${error?.message}`);
      throw new BadRequestException('Could not save your profile');
    }
    return data;
  }

  /**
   * Returns the caller's profile row. The row is created automatically by the
   * `on_auth_user_created` trigger in database-schema.sql, so it should always
   * exist by the time the app calls this.
   */
  async getMe(userId: string): Promise<ProfileMeDto> {
    const { data, error } = await getSupabaseAdmin()
      .from('users')
      .select('id, name, email, roll_number, id_card_image_url, id_verified, role, hostel')
      .eq('id', userId)
      .single();

    if (error || !data) {
      this.logger.error(`Profile lookup failed for ${userId}: ${error?.message}`);
      throw new BadRequestException('Profile not found');
    }

    return data as ProfileMeDto;
  }
}
