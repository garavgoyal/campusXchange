export const COLLEGE_EMAIL_DOMAIN = '@thapar.edu';

// Supabase issues 6-digit codes for signup confirmation and 8-digit codes for
// magic links, and the length is configurable in the dashboard. Accept the range
// rather than hardcoding one number.
export const OTP_MIN_LENGTH = 6;
export const OTP_MAX_LENGTH = 8;
