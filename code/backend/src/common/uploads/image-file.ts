import { BadRequestException } from '@nestjs/common';

/** Every photo upload (ID card, listing, condition) is capped at this size. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB

/**
 * Multer options for a single image field. The size cap is enforced while the
 * upload streams in, so an oversized file is cut off at 8 MB instead of being
 * read into memory first (Nest answers 413 Payload Too Large).
 */
export const IMAGE_UPLOAD_OPTIONS = {
  limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 10, fieldSize: 1024 },
};

export type DetectedImage = { ext: 'jpg' | 'png' | 'webp' | 'heic'; mime: string };

const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1', 'avif']);

/**
 * Works out what a file really is from its first bytes ("magic numbers"),
 * ignoring the name and content type the client claims. Only JPEG, PNG, WebP
 * and HEIC/HEIF photos are recognised. SVG is deliberately not an image here:
 * it can carry scripts, and these files are served from a public bucket.
 */
export function detectImage(buffer: Buffer | undefined | null): DetectedImage | null {
  if (!buffer || buffer.length < 12) return null;
  const b = buffer;

  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };

  if (
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) {
    return { ext: 'png', mime: 'image/png' };
  }

  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    return { ext: 'webp', mime: 'image/webp' };
  }

  // ISO media: [size:4]["ftyp"][major brand:4]...
  if (b.toString('ascii', 4, 8) === 'ftyp' && HEIF_BRANDS.has(b.toString('ascii', 8, 12))) {
    return { ext: 'heic', mime: b.toString('ascii', 8, 12) === 'avif' ? 'image/avif' : 'image/heic' };
  }

  return null;
}

/**
 * Validates one uploaded photo and returns the storage extension and content
 * type to use. Both come from the file's bytes, never from the client, so a
 * script or web page can't be stored under an image label or a made-up name.
 */
export function requireImage(file: Express.Multer.File | undefined, what = 'Photos'): DetectedImage {
  if (!file) throw new BadRequestException('No file provided');
  if (file.size > MAX_IMAGE_BYTES) throw new BadRequestException('Image is larger than 8 MB');
  const kind = detectImage(file.buffer);
  if (!kind) {
    throw new BadRequestException(`${what} must be JPEG, PNG, WebP or HEIC images`);
  }
  return kind;
}
