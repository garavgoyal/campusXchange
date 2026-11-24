import { describe, expect, it } from 'vitest';
import { formatDistance, formatDistanceShort } from '../formatDistance';

// FR-BRW-8 (app side): how the distance to a meeting point is shown.
describe('FR-BRW-8 · distance labels', () => {
  it('shows "In your hostel" for the same place', () => {
    expect(formatDistance(0)).toBe('In your hostel');
    expect(formatDistanceShort(10)).toBe('Your hostel');
  });

  it('rounds metres and adds a walking time', () => {
    expect(formatDistance(283)).toBe('~280 m · 4 min walk');
    expect(formatDistance(1240)).toBe('~1.2 km · 16 min walk');
    expect(formatDistanceShort(283)).toBe('280 m');
  });

  it('shows nothing when the distance is unknown', () => {
    expect(formatDistance(null)).toBeNull();
    expect(formatDistanceShort(undefined)).toBeNull();
  });
});
