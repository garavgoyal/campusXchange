import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useRealtimeRefresh } from '../../lib/realtime';
import { useProfile } from '../profile/hooks';
import { fetchNotifications, markRead, type AppNotification } from '../notifications/api';

/** Notifications that mean "something new in this chat". */
const CHAT_TYPES = new Set(['new_message', 'new_offer', 'offer_accepted', 'offer_rejected']);

/** Fallback refresh while realtime is unavailable. */
const POLL_MS = 20000;

function chatIdsOf(list: AppNotification[]): Set<string> {
  const ids = new Set<string>();
  for (const n of list) {
    if (!n.read && CHAT_TYPES.has(n.type) && n.payload?.chat_id) ids.add(n.payload.chat_id);
  }
  return ids;
}

/**
 * Chats with something the user hasn't seen yet: an unread message or offer
 * notification for that chat. Drives the dot on each thread and the count on
 * the Chats tab. Updates live through the notifications realtime channel.
 */
export function useUnreadChats() {
  const { session } = useProfile();
  const userId = session?.user.id;
  const [unread, setUnread] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    if (!userId) {
      setUnread(new Set());
      return;
    }
    try {
      setUnread(chatIdsOf(await fetchNotifications()));
    } catch {
      /* the markers are a hint; ignore network blips */
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useEffect(() => {
    if (!userId) return;
    const timer = setInterval(load, POLL_MS);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && load());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [userId, load]);

  useRealtimeRefresh(
    userId ? [{ table: 'notifications', filter: `user_id=eq.${userId}` }] : [],
    load,
    !!userId,
  );

  return { unread, refresh: load };
}

let lastMarked: { chatId: string; at: number } | null = null;

/**
 * Marks this chat's message/offer notifications as read, so its dot, the Chats
 * tab count and the bell clear once the chat is open. Called on each refresh of
 * an open chat, so it is throttled to once every few seconds per chat.
 */
export async function markChatSeen(chatId: string) {
  const now = Date.now();
  if (lastMarked && lastMarked.chatId === chatId && now - lastMarked.at < 4000) return;
  lastMarked = { chatId, at: now };
  try {
    const list = await fetchNotifications();
    const mine = list.filter((n) => !n.read && CHAT_TYPES.has(n.type) && n.payload?.chat_id === chatId);
    await Promise.all(mine.map((n) => markRead(n.id)));
  } catch {
    /* not critical: the dot clears on the next successful open */
  }
}
