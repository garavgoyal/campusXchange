import { BadRequestException } from '@nestjs/common';
import { detectImage, MAX_IMAGE_BYTES, requireImage } from './image-file.js';

const bytes = (...parts: (number[] | string | Buffer)[]) =>
  Buffer.concat(parts.map((p) => (typeof p === 'string' ? Buffer.from(p, 'latin1') : Buffer.from(p))));
const pad = Buffer.alloc(16);

const file = (buffer: Buffer, extra: Partial<Express.Multer.File> = {}) =>
  ({ buffer, size: buffer.length, mimetype: 'image/png', originalname: 'x.png', ...extra }) as Express.Multer.File;

describe('detectImage (NFR-SEC-6: file type from the bytes)', () => {
  it('recognises JPEG, PNG, WebP and HEIC', () => {
    expect(detectImage(bytes([0xff, 0xd8, 0xff, 0xe0], pad))?.ext).toBe('jpg');
    expect(detectImage(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], pad))?.ext).toBe('png');
    expect(detectImage(bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8 ', pad))?.ext).toBe('webp');
    expect(detectImage(bytes([0, 0, 0, 0x18], 'ftypheic', pad))).toEqual({ ext: 'heic', mime: 'image/heic' });
  });

  it('refuses SVG, HTML, GIF, PDF and anything too short', () => {
    for (const b of [
      bytes('<svg xmlns="http://www.w3.org/2000/svg">'),
      bytes('<!doctype html><script>'),
      bytes('GIF89a', pad),
      bytes('%PDF-1.7', pad),
      bytes([0xff, 0xd8]),
    ]) {
      expect(detectImage(b)).toBeNull();
    }
    expect(detectImage(undefined)).toBeNull();
  });
});

describe('requireImage', () => {
  it('ignores the name and label the client sends', () => {
    const png = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], pad);
    expect(requireImage(file(png, { mimetype: 'text/html', originalname: 'page.html' }))).toEqual({ ext: 'png', mime: 'image/png' });
  });

  it('refuses a missing file, a non-image and an oversized file', () => {
    expect(() => requireImage(undefined)).toThrow(BadRequestException);
    expect(() => requireImage(file(bytes('<svg>', pad), { mimetype: 'image/svg+xml' }))).toThrow(/JPEG, PNG, WebP or HEIC/);
    const big = file(bytes([0xff, 0xd8, 0xff, 0xe0], pad), { size: MAX_IMAGE_BYTES + 1 });
    expect(() => requireImage(big)).toThrow(/8 MB/);
  });
});
