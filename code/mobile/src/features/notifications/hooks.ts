import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useRealtimeRefresh } from '../../lib/realtime';
import { useProfile } from '../profile/hooks';
import { fetchUnreadCount } from './api';

/** Unread notification count for the bell badge; live via realtime. */
export function useUnreadCount() {
  const { session } = useProfile();
  const userId = session?.user.id;
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    if (!userId) {
      setUnread(0);
      return;
    }
    try {
      setUnread(await fetchUnreadCount());
    } catch {
      /* badge is decorative; ignore network blips */
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useRealtimeRefresh(
    userId ? [{ table: 'notifications', filter: `user_id=eq.${userId}` }] : [],
    load,
    !!userId,
  );

  return unread;
}
