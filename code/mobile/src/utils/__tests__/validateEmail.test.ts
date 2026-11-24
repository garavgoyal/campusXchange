import { describe, expect, it } from 'vitest';
import { isValidCollegeEmail, normalizeEmail } from '../validateEmail';

// FR-AUTH-2 (app side): only @thapar.edu addresses get an OTP.
describe('FR-AUTH-2 · college email check in the app', () => {
  it('accepts a Thapar address, ignoring case and spaces', () => {
    expect(isValidCollegeEmail('ggoyal_be24@thapar.edu')).toBe(true);
    expect(isValidCollegeEmail('  GGoyal_BE24@THAPAR.EDU ')).toBe(true);
    expect(normalizeEmail('  A@Thapar.Edu ')).toBe('a@thapar.edu');
  });

  it.each(['someone@gmail.com', 'x@thapar.edu.evil.com', 'x@notthapar.edu', 'thapar.edu', '@thapar.edu', 'a b@thapar.edu', ''])(
    'refuses "%s"',
    (email) => {
      expect(isValidCollegeEmail(email)).toBe(false);
    },
  );
});
