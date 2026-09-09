import { COLLEGE_EMAIL_DOMAIN } from '../constants/config';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isValidCollegeEmail(email: string): boolean {
  const normalized = normalizeEmail(email);
  // Basic shape check plus the college domain requirement.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
    && normalized.endsWith(COLLEGE_EMAIL_DOMAIN);
}
