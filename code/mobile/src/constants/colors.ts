/**
 * CampusXchange design tokens — sage, off-white and a touch of tomato.
 *
 * Sage is the primary action ("go / confirm / verified"). Tomato is the
 * accent: it draws the eye to the one thing that needs attention (post, make a
 * counter-offer, a discount, an alert), so use it sparingly. Semantic status
 * colours are separate from both.
 *
 * Surfaces are "light glass": translucent off-white over a soft tinted
 * background, with a hairline white border. Real blur is used only on bars,
 * sheets and floating controls (see GlassView), so lists stay fast on budget
 * Android phones.
 */
export const colors = {
  // surfaces
  background: '#F4F2EA',
  surface: '#FFFFFF',
  surfaceSunk: '#ECEAE1',

  glass: 'rgba(255,255,255,0.72)',
  glassStrong: 'rgba(255,255,255,0.88)',
  glassBorder: 'rgba(255,255,255,0.9)',
  glassTint: 'rgba(250,249,244,0.78)',

  border: '#E3E1D7',
  borderStrong: '#D2D6CB',

  // text
  text: '#1E2B22',
  textMuted: '#5F6A62',
  textFaint: '#97A099',

  // brand: sage
  primary: '#557459',
  primaryPressed: '#46624B',
  primaryTint: '#E5ECE2',
  primarySoft: '#C9D8C6',

  // accent: tomato
  accent: '#D44A32',
  accentPressed: '#B93C27',
  accentTint: '#FBE7E2',

  // semantic
  success: '#557459',
  successTint: '#E5ECE2',
  warning: '#A86B12',
  warningTint: '#F8EED9',
  error: '#C23A2B',
  errorTint: '#FBE7E2',

  onBrand: '#FFFFFF',

  /** Colour of soft shadows (a deep sage, never pure black). */
  shadow: '#2F4334',
};

/** Corner radii — cards are noticeably rounder than inputs. */
export const radius = {
  chip: 999,
  input: 14,
  button: 16,
  card: 20,
  sheet: 26,
};

/**
 * Font families. Space Grotesk for display (titles, prices), Plus Jakarta Sans
 * for everything else. On Android a custom font ignores `fontWeight`, so each
 * weight is its own family — use these instead of `fontWeight`.
 */
export const fonts = {
  regular: 'PlusJakartaSans_400Regular',
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
  display: 'SpaceGrotesk_600SemiBold',
  displayBold: 'SpaceGrotesk_700Bold',
};

/** Section labels above inputs: small, uppercase, letter-spaced. */
export const typography = {
  label: { fontSize: 11, fontFamily: fonts.bold, letterSpacing: 0.8 },
  title: { fontSize: 26, fontFamily: fonts.displayBold, letterSpacing: -0.4 },
  body: { fontSize: 15, fontFamily: fonts.regular },
  meta: { fontSize: 12, fontFamily: fonts.medium },
};

/**
 * Soft, sage-tinted elevation for cards and floating controls. Translucent
 * cards get no Android elevation: it would show through the glass as a grey
 * smudge, so on Android they rely on their white hairline instead.
 */
export const shadow = {
  card: {
    shadowColor: '#2F4334',
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 0,
  },
  float: {
    shadowColor: '#2F4334',
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
};
