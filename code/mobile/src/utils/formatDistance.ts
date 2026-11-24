/** Walking pace used for the "min walk" estimate (~4.8 km/h). */
const METRES_PER_MINUTE = 80;

/**
 * "In your hostel", "~350 m · 5 min walk", "1.2 km · 15 min walk".
 * Distances are straight-line between campus points, so they're rounded and
 * prefixed with "~".
 */
export function formatDistance(metres: number | null | undefined): string | null {
  if (metres == null) return null;
  if (metres < 30) return 'In your hostel';
  const minutes = Math.max(1, Math.round(metres / METRES_PER_MINUTE));
  const length = metres < 1000 ? `~${Math.round(metres / 10) * 10} m` : `~${(metres / 1000).toFixed(1)} km`;
  return `${length} · ${minutes} min walk`;
}

/** Short form for feed cards: "350 m", "1.2 km", "Your hostel". */
export function formatDistanceShort(metres: number | null | undefined): string | null {
  if (metres == null) return null;
  if (metres < 30) return 'Your hostel';
  return metres < 1000 ? `${Math.round(metres / 10) * 10} m` : `${(metres / 1000).toFixed(1)} km`;
}
