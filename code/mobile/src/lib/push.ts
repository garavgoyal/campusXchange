import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import type { Session } from '@supabase/supabase-js';
import { apiSend } from './apiClient';

/**
 * Phone push notifications (Expo push service — free).
 *
 * Works in a development build or store build. It is skipped, silently, in:
 *   - Expo Go (Android Expo Go can't receive remote pushes since SDK 53)
 *   - simulators/emulators and the web build
 *   - builds without an EAS project id (run `eas init` once to add it)
 * In those cases everything else works exactly as before — notifications still
 * appear in the in-app inbox.
 */

const TOKEN_KEY = 'cx.pushToken';

// Show notifications as banners even while the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function projectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId;
}

/** Why push can't work here, or null if it can. */
export function pushUnavailableReason(): string | null {
  if (Platform.OS === 'web') return 'web';
  if (!Device.isDevice) return 'simulator';
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return 'expo-go';
  if (!projectId()) return 'no-eas-project';
  return null;
}

/**
 * Asks for permission (once — the OS remembers the answer), gets this phone's
 * Expo push token and registers it for the signed-in student.
 */
export async function registerForPush(): Promise<string | null> {
  const reason = pushUnavailableReason();
  if (reason) {
    if (reason === 'no-eas-project') console.warn('[push] No EAS projectId in app.json — run `eas init`.');
    return null;
  }
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'CampusXchange',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
    let { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') status = (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return null;

    const token = (await Notifications.getExpoPushTokenAsync({ projectId: projectId() })).data;
    await apiSend('/notifications/push-token', 'POST', { token, platform: Platform.OS });
    await AsyncStorage.setItem(TOKEN_KEY, token);
    return token;
  } catch (e) {
    console.warn('[push] Could not register:', e instanceof Error ? e.message : e);
    return null;
  }
}

/** On sign-out: this phone stops getting that student's notifications. */
export async function unregisterPush(): Promise<void> {
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (!token) return;
    await apiSend('/notifications/push-token', 'DELETE', { token });
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch {
    // Signing out must never fail because of this.
  }
}

/** Opens the screen a notification is about. */
export function openFromNotification(data: Record<string, unknown> | undefined) {
  const id = (key: string) => (typeof data?.[key] === 'string' ? (data[key] as string) : undefined);
  const deal = id('transaction_id');
  const chat = id('chat_id');
  const listing = id('listing_id');
  if (deal) router.push({ pathname: '/deal/[id]', params: { id: deal } });
  else if (chat) router.push({ pathname: '/chat/[id]', params: { id: chat } });
  else if (listing) router.push({ pathname: '/listing/[id]', params: { id: listing } });
  else router.push('/notifications');
}

/**
 * Mounted once in the root layout: registers the phone whenever someone is
 * signed in, and handles taps on notifications (also when the tap launched the app).
 */
export function usePushNotifications(session: Session | null) {
  const registeredFor = useRef<string | null>(null);
  const lastResponse = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    const userId = session?.user.id ?? null;
    if (!userId) {
      registeredFor.current = null;
      return;
    }
    if (registeredFor.current === userId) return;
    registeredFor.current = userId;
    registerForPush();
  }, [session?.user.id]);

  useEffect(() => {
    if (!lastResponse || !session) return;
    const key = lastResponse.notification.request.identifier;
    if (handled.current === key) return;
    handled.current = key;
    openFromNotification(lastResponse.notification.request.content.data as Record<string, unknown>);
  }, [lastResponse, session]);
}
