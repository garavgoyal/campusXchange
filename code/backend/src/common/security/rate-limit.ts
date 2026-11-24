import { createHash } from 'node:crypto';
import type { ExecutionContext } from '@nestjs/common';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';

/**
 * Rate limits, counted per signed-in session (or per IP for guests) and per
 * endpoint. Generous for a real student, but they stop one account flooding the
 * review queue, a chat or storage. A blocked request gets 429.
 *
 * RATE_LIMIT_SCALE multiplies every limit (default 1). The automated tests run
 * with a large value so a test can do in seconds what a student does in a week.
 */
export const RATE_LIMITS = {
  /** Any request, per endpoint, per minute. */
  perMinute: 120,
  /** POST / PATCH / PUT / DELETE, per endpoint, per minute (messages, offers…). */
  writesPerMinute: 30,
  /** New listings per hour. */
  listingsPerHour: 20,
  /** Photo uploads (listing, ID card, condition) per 10 minutes. */
  uploadsPer10Min: 40,
};

const MINUTE = 60_000;

export function rateLimitScale(): number {
  const n = Number(process.env.RATE_LIMIT_SCALE ?? 1);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export const scaled = (limit: number) => () => Math.max(1, Math.round(limit * rateLimitScale()));

const isRead = (context: ExecutionContext) =>
  ['GET', 'HEAD', 'OPTIONS'].includes(context.switchToHttp().getRequest().method);

/**
 * Who a request counts against. Signed-in: a hash of the session token, so the
 * many students behind one campus Wi-Fi IP don't share a limit, and nobody can
 * use up someone else's (they would need that person's token). Guests: their IP.
 */
export function rateLimitTracker(req: Record<string, any>): string {
  const auth = req.headers?.authorization;
  if (typeof auth === 'string' && auth.startsWith('Bearer ') && auth.length > 27) {
    return 'session:' + createHash('sha256').update(auth.slice(7).trim()).digest('hex').slice(0, 32);
  }
  return 'ip:' + (req.ip ?? req.socket?.remoteAddress ?? 'unknown');
}

export const rateLimitOptions: ThrottlerModuleOptions = {
  errorMessage: 'Too many requests. Wait a minute and try again.',
  getTracker: rateLimitTracker,
  throttlers: [
    { name: 'all', ttl: MINUTE, limit: scaled(RATE_LIMITS.perMinute) },
    { name: 'writes', ttl: MINUTE, limit: scaled(RATE_LIMITS.writesPerMinute), skipIf: isRead },
  ],
};

/** @Throttle() override for POST /listings. */
export const LISTING_CREATE_LIMIT = {
  writes: { ttl: 60 * MINUTE, limit: scaled(RATE_LIMITS.listingsPerHour) },
};

/** @Throttle() override for the photo upload endpoints. */
export const UPLOAD_LIMIT = {
  writes: { ttl: 10 * MINUTE, limit: scaled(RATE_LIMITS.uploadsPer10Min) },
};
