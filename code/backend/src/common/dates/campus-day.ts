/**
 * Lend dates are calendar days on campus (India), not in UTC. Between midnight
 * and 05:30 IST, UTC is still on the previous day, so "today" and "tomorrow"
 * must be worked out in the campus time zone.
 */
export const CAMPUS_TIME_ZONE = process.env.CAMPUS_TIME_ZONE || 'Asia/Kolkata';

/** YYYY-MM-DD on campus, `offsetDays` from today. */
export function campusDay(offsetDays = 0, now: Date = new Date()): string {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: CAMPUS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  if (!offsetDays) return today;
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}
