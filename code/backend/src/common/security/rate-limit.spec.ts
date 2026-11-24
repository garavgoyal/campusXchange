import { RATE_LIMITS, rateLimitTracker, scaled } from './rate-limit.js';

describe('NFR-SEC-9 · rate limits', () => {
  afterEach(() => {
    delete process.env.RATE_LIMIT_SCALE;
  });

  it('counts signed-in requests per session, not per shared campus IP', () => {
    const a = rateLimitTracker({ headers: { authorization: 'Bearer token-of-student-a-xxxxxxxx' }, ip: '10.0.0.1' });
    const b = rateLimitTracker({ headers: { authorization: 'Bearer token-of-student-b-xxxxxxxx' }, ip: '10.0.0.1' });
    expect(a).not.toBe(b);
    expect(a).toMatch(/^session:[0-9a-f]{32}$/);
    expect(a).not.toContain('student-a');
  });

  it('counts guests by IP', () => {
    expect(rateLimitTracker({ headers: {}, ip: '10.0.0.7' })).toBe('ip:10.0.0.7');
  });

  it('RATE_LIMIT_SCALE multiplies the limits (used by the automated tests)', () => {
    expect(scaled(RATE_LIMITS.listingsPerHour)()).toBe(20);
    process.env.RATE_LIMIT_SCALE = '1000';
    expect(scaled(RATE_LIMITS.listingsPerHour)()).toBe(20_000);
    process.env.RATE_LIMIT_SCALE = 'nonsense';
    expect(scaled(RATE_LIMITS.listingsPerHour)()).toBe(20);
  });
});
