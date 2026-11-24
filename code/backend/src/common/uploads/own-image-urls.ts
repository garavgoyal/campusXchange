import { BadRequestException } from '@nestjs/common';
import { getSupabaseAdmin } from '../../database/supabase.client.js';

/** Where POST /listings/images puts a student's photos: <bucket>/<userId>/... */
export function ownImagePrefix(userId: string): string {
  const bucket = process.env.SUPABASE_LISTING_IMAGE_BUCKET ?? 'listing-images';
  return getSupabaseAdmin().storage.from(bucket).getPublicUrl(`${userId}/`).data.publicUrl;
}

/**
 * Listing and swap-offer photos must be ones the student uploaded through
 * POST /listings/images, i.e. public URLs inside their own storage folder.
 * This stops outside links (tracking pixels, unmoderated pictures, `javascript:`
 * strings) and other students' photos being attached. `alreadyOn` lets an edit
 * keep the photos the listing already has.
 */
export function requireOwnImageUrls(
  urls: string[] | undefined,
  userId: string,
  what: string,
  alreadyOn: string[] = [],
): string[] {
  if (!urls?.length) return [];
  const prefix = ownImagePrefix(userId);
  const kept = new Set(alreadyOn);
  for (const url of urls) {
    const ok =
      typeof url === 'string' &&
      url.length <= 500 &&
      !url.includes('..') &&
      (kept.has(url) || (url.startsWith(prefix) && url.length > prefix.length));
    if (!ok) throw new BadRequestException(`${what} must be photos you uploaded in the app`);
  }
  return urls;
}
