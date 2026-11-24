import { campusDay } from './campus-day.js';

describe('campusDay (FR-LND-3, FR-PAY-3: dates are campus calendar days)', () => {
  it('uses the India date just after midnight IST, when UTC is still on the previous day', () => {
    const at0020Ist = new Date('2026-11-22T18:50:00Z'); // 00:20 on 23 Nov in India
    expect(campusDay(0, at0020Ist)).toBe('2026-11-23');
    expect(campusDay(1, at0020Ist)).toBe('2026-11-24');
  });

  it('crosses month and year ends', () => {
    const lateDec = new Date('2026-12-31T12:00:00Z');
    expect(campusDay(1, lateDec)).toBe('2027-01-01');
    expect(campusDay(-31, lateDec)).toBe('2026-11-30');
  });
});
