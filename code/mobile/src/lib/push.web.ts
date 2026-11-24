import type { Session } from '@supabase/supabase-js';

/**
 * Web build: there are no phone push notifications on the web, and
 * expo-notifications' native calls throw there, so everything is a no-op.
 * (The phone version is push.ts.)
 */
export function pushUnavailableReason(): string | null {
  return 'web';
}

export async function registerForPush(): Promise<string | null> {
  return null;
}

export async function unregisterPush(): Promise<void> {}

export function openFromNotification(_data: Record<string, unknown> | undefined) {}

export function usePushNotifications(_session: Session | null) {}
