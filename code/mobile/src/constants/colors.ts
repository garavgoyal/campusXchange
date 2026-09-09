/**
 * CampusXchange design tokens.
 *
 * Two brand colours, taken from the logo: emerald is the primary action,
 * amber is the secondary/counter action. They are never interchangeable —
 * emerald means "go / confirm / verified", amber means "attention / negotiate /
 * pending". Semantic status colours are separate from both.
 */
export const colors = {
  // surfaces
  background: '#F7F7FA',
  surface: '#FFFFFF',
  surfaceSunk: '#F0F0F5',

  border: '#E7E7EE',
  borderStrong: '#D8D8E2',

  // text
  text: '#17171F',
  textMuted: '#6E7078',
  textFaint: '#9A9CA6',

  // brand
  primary: '#0F7B5C',
  primaryPressed: '#0B6249',
  primaryTint: '#E4F2EC',

  accent: '#D9821F',
  accentTint: '#FCF1E1',

  // semantic
  success: '#0F7B5C',
  successTint: '#E4F2EC',
  warning: '#B7791F',
  warningTint: '#FBF0DC',
  error: '#D92D20',
  errorTint: '#FCEAE8',

  onBrand: '#FFFFFF',
};

/** Corner radii — cards are noticeably rounder than inputs. */
export const radius = {
  chip: 999,
  input: 12,
  button: 14,
  card: 16,
  sheet: 20,
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

/** Section labels above inputs: small, uppercase, letter-spaced. */
export const typography = {
  label: { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.8 },
  title: { fontSize: 24, fontWeight: '700' as const },
  body: { fontSize: 15 },
  meta: { fontSize: 12 },
};
