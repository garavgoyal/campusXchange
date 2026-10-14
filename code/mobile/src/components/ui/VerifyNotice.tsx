import React from 'react';
import { router } from 'expo-router';
import { Pressable } from 'react-native';
import { Banner } from './Banner';
import type { ProfileMe } from '../../features/profile/types';

/** True when this account may list, chat and trade (backend: VerifiedStudentGuard). */
export function canTrade(profile: ProfileMe | null): boolean {
  return !!profile && (profile.role === 'admin' || profile.id_verified === 'verified');
}

/**
 * Explains why trading actions are locked for a signed-in but unverified student.
 * Renders nothing when the account is verified (or is an admin).
 */
export function VerifyNotice({ profile }: { profile: ProfileMe | null }) {
  if (!profile || canTrade(profile)) return null;

  const rejected = profile.id_verified === 'rejected';
  const missing = !profile.id_card_image_url;

  return (
    <Pressable onPress={() => router.push('/(auth)/id-card')} accessibilityRole="button">
      <Banner
        icon={rejected ? 'alert-circle-outline' : 'hourglass-outline'}
        tone="warning"
        title={
          rejected
            ? 'ID card not accepted'
            : missing
              ? 'Verify your student ID to trade'
              : 'Waiting for ID verification'
        }
        message={
          rejected
            ? 'Tap to upload a clearer photo. Listing, chatting and deals unlock once an admin approves it.'
            : missing
              ? 'Tap to upload your college ID card. Listing, chatting and deals unlock once an admin approves it.'
              : 'An admin is reviewing your ID card. You can browse meanwhile — listing, chatting and deals unlock once approved.'
        }
      />
    </Pressable>
  );
}
