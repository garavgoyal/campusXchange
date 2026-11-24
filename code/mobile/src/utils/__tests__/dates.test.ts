import { afterEach, describe, expect, it, vi } from 'vitest';
import { fromIsoDay, localIsoDay, toIsoDay } from '../dates';

// FR-PAY-3 (app side): lend dates are picked as local calendar days.
describe('FR-PAY-3 · lend date helpers', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses the phone’s local date, not UTC (just after midnight in India)', () => {
    vi.useFakeTimers();
    // 00:30 on 22 Nov in India is still 21 Nov in UTC.
    vi.setSystemTime(new Date(2026, 10, 22, 0, 30));
    expect(localIsoDay()).toBe('2026-11-22');
    expect(localIsoDay(7)).toBe('2026-11-29');
  });

  it('round-trips YYYY-MM-DD as a local date', () => {
    const d = fromIsoDay('2026-12-31');
    expect(d && toIsoDay(d)).toBe('2026-12-31');
    expect(d?.getHours()).toBe(0);
  });

  it('refuses anything that is not YYYY-MM-DD', () => {
    expect(fromIsoDay('31/12/2026')).toBeNull();
    expect(fromIsoDay('')).toBeNull();
  });
});
