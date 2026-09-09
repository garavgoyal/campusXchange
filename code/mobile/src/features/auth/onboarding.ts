import { getMyProfile } from '../profile/api';

export type OnboardingStep = '/(auth)/id-card' | '/(tabs)';

/**
 * Where a just-verified user belongs. Someone who already uploaded their ID
 * goes straight to the feed — signing in on a new phone must not ask again.
 *
 * The roll number is collected on the signup screen itself, so it isn't a step
 * here. If the backend can't be reached we send them to the ID screen, which
 * has a "Skip for now", so a down backend never locks anyone out.
 */
export async function nextOnboardingStep(): Promise<OnboardingStep> {
  const profile = await getMyProfile();
  if (!profile) return '/(auth)/id-card';
  return profile.id_card_image_url ? '/(tabs)' : '/(auth)/id-card';
}
