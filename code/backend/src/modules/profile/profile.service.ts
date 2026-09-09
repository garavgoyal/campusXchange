import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { getSupabaseAdmin } from '../../database/supabase.client.js';
import type { ProfileMeDto, UploadIdCardResponseDto } from './dto/upload-id-card.dto.js';

const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp'];
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB

/**
 * Accept anything the client labels as an image. Some clients send no content-type
 * at all (it arrives as application/octet-stream), so fall back to the file
 * extension rather than rejecting a perfectly good photo.
 */
function isAcceptableImage(file: Express.Multer.File): boolean {
  if (file.mimetype?.startsWith('image/')) return true;
  const extension = file.originalname?.split('.').pop()?.toLowerCase() ?? '';
  return ALLOWED_EXTENSIONS.includes(extension);
}

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);
  private readonly bucket = process.env.SUPABASE_ID_CARD_BUCKET ?? 'id-cards';

  /**
   * Stores the student's ID card photo in the private `id-cards` bucket and
   * records it on their profile as awaiting manual admin review.
   */
  async uploadIdCard(
    userId: string,
    file?: Express.Multer.File,
  ): Promise<UploadIdCardResponseDto> {
    if (!file) throw new BadRequestException('No file provided');

    if (!isAcceptableImage(file)) {
      throw new BadRequestException(
        `Unsupported file type: ${file.mimetype}. Upload a JPEG or PNG image.`,
      );
    }

    if (file.size > MAX_BYTES) {
      throw new BadRequestException('Image is larger than 8 MB');
    }

    const supabase = getSupabaseAdmin();
    const extension = file.originalname.split('.').pop()?.toLowerCase() || 'jpg';
    // Namespaced by user id so one student can never overwrite another's file.
    const path = `${userId}/${Date.now()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(this.bucket)
      .upload(path, file.buffer, {
        contentType: file.mimetype?.startsWith('image/')
          ? file.mimetype
          : `image/${extension === 'jpg' ? 'jpeg' : extension}`,
        upsert: false,
      });

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

  /** Saves the profile fields collected at signup (name, roll number). */
  async updateProfile(userId: string, patch: { name?: string; roll_number?: string }) {
    const update: Record<string, string> = {};
    if (patch.name !== undefined) update.name = patch.name.trim();
    if (patch.roll_number !== undefined) update.roll_number = patch.roll_number;

    if (Object.keys(update).length === 0) {
      throw new BadRequestException('Nothing to update');
    }

    const { data, error } = await getSupabaseAdmin()
      .from('users')
      .update(update)
      .eq('id', userId)
      .select('id, name, roll_number')
      .single();

    if (error || !data) {
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
      .select('id, name, email, roll_number, id_card_image_url, id_verified, role')
      .eq('id', userId)
      .single();

    if (error || !data) {
      this.logger.error(`Profile lookup failed for ${userId}: ${error?.message}`);
      throw new BadRequestException('Profile not found');
    }

    return data as ProfileMeDto;
  }
}
