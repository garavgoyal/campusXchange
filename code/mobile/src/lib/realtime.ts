import { useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';

type Watch = {
  /** Table in the public schema, e.g. 'messages'. */
  table: 'messages' | 'offers' | 'transactions' | 'notifications';
  /** Postgres-changes filter, e.g. `chat_id=eq.${chatId}`. */
  filter?: string;
};

/**
 * Calls `onChange` whenever a watched row is inserted or updated.
 *
 * The event is only a *signal*: the screen re-fetches through the backend, so
 * the backend's rules still decide what the user sees. Supabase Realtime only
 * delivers rows the user may read under RLS (see migration 006), so a user can
 * never be signalled about someone else's chat or deal.
 *
 * If realtime isn't set up (migration 006 not run, or the socket drops), nothing
 * breaks — screens also keep a slow fallback poll.
 */
export function useRealtimeRefresh(watches: Watch[], onChange: () => void, enabled = true) {
  const callback = useRef(onChange);
  callback.current = onChange;

  // Stable key so the subscription isn't torn down on every render.
  const key = watches.map((w) => `${w.table}:${w.filter ?? '*'}`).join('|');

  useEffect(() => {
    if (!enabled || !key) return;

    let timer: ReturnType<typeof setTimeout> | null = null;
    // Coalesce bursts (e.g. accept offer → 3 offer rows update at once).
    const fire = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => callback.current(), 150);
    };

    const channel = supabase.channel(`rt-${key}-${Math.random().toString(36).slice(2, 8)}`);
    for (const part of key.split('|')) {
      const [table, filter] = part.split(':');
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          ...(filter && filter !== '*' ? { filter } : {}),
        },
        fire,
      );
    }
    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [key, enabled]);
}
