import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { getSupabaseAdmin } from '../../database/supabase.client.js';

/** What an Expo push token looks like: ExponentPushToken[xxxx] (older: ExpoPushToken[xxxx]). */
const TOKEN_PATTERN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,}\]$/;
/** Expo accepts up to 100 messages per request. */
const CHUNK = 100;

export type PushMessage = {
  title: string;
  body: string;
  /** Delivered to the app with the notification; the app uses it to open the right screen. */
  data: Record<string, string | undefined>;
};

type ExpoTicket = { status: 'ok' | 'error'; id?: string; message?: string; details?: { error?: string } };

/**
 * Phone push notifications through Expo's free push service
 * (https://docs.expo.dev/push-notifications/sending-notifications/).
 *
 * Every in-app notification is also pushed to the recipient's phones. Pushing is
 * strictly best-effort: it never delays or fails the action that caused it, and
 * the in-app notification is always saved first.
 *
 * Env:
 *   EXPO_PUSH_URL      override the endpoint (tests point it at a local stub)
 *   EXPO_ACCESS_TOKEN  only if "enhanced push security" is turned on in Expo
 *   PUSH_DISABLED=1    turn pushing off entirely
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly url = process.env.EXPO_PUSH_URL ?? 'https://exp.host/--/api/v2/push/send';

  /** Saves this phone's token for the user. A phone that changes hands moves to its new owner. */
  async register(userId: string, token: string, platform?: string) {
    if (!TOKEN_PATTERN.test(token)) throw new BadRequestException('That is not an Expo push token');
    const now = new Date().toISOString();
    const { error } = await getSupabaseAdmin()
      .from('push_tokens')
      .upsert(
        { token, user_id: userId, platform: platform ?? null, last_seen_at: now },
        { onConflict: 'token' },
      );
    if (error) throw new BadRequestException(error.message);
    return { ok: true };
  }

  /** Called on sign-out, so the phone stops receiving this user's notifications. */
  async unregister(userId: string, token: string) {
    await getSupabaseAdmin().from('push_tokens').delete().eq('token', token).eq('user_id', userId);
    return { ok: true };
  }

  /** Fire-and-forget: returns at once; failures are only logged. */
  sendToUsers(userIds: string[], message: PushMessage) {
    if (process.env.PUSH_DISABLED === '1' || !userIds.length) return;
    this.deliver(userIds, message).catch((e) =>
      this.logger.warn(`Push failed: ${(e as Error).message}`),
    );
  }

  private async deliver(userIds: string[], message: PushMessage) {
    const supabase = getSupabaseAdmin();
    const { data: rows, error } = await supabase
      .from('push_tokens')
      .select('token')
      .in('user_id', userIds);
    if (error) throw new Error(error.message);
    const tokens = (rows ?? []).map((r) => r.token as string);
    if (!tokens.length) return;

    const data = Object.fromEntries(Object.entries(message.data).filter(([, v]) => v != null));
    for (let i = 0; i < tokens.length; i += CHUNK) {
      const batch = tokens.slice(i, i + CHUNK);
      const res = await fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}),
        },
        body: JSON.stringify(
          batch.map((to) => ({
            to,
            title: message.title,
            body: message.body,
            data,
            sound: 'default',
            channelId: 'default',
          })),
        ),
      });
      if (!res.ok) throw new Error(`Expo push returned ${res.status}`);
      const body = (await res.json()) as { data?: ExpoTicket[] };

      // Tokens Expo says are dead (app uninstalled, notifications revoked): forget them.
      const dead = (body.data ?? [])
        .map((ticket, n) => (ticket.details?.error === 'DeviceNotRegistered' ? batch[n] : null))
        .filter((t): t is string => !!t);
      if (dead.length) {
        await supabase.from('push_tokens').delete().in('token', dead);
        this.logger.log(`Removed ${dead.length} expired push token(s)`);
      }
    }
  }
}
