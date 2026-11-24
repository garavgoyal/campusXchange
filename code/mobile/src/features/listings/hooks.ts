import { useCallback, useEffect, useRef, useState } from 'react';
import { FEED_PAGE_SIZE, fetchListings } from './api';
import type { Listing, ListingQuery } from './types';

/** Waits for typing to pause before searching, so each keystroke isn't a request. */
function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

/**
 * The feed, a page at a time. `loadMore` fetches the next page when the list
 * nears its end; a newer query always wins over a slower, older response.
 */
export function useListings(query: ListingQuery, options: { reloadKey?: string | null } = {}) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { type, category, sort } = query;
  // Changing your hostel changes every distance, so it refetches the feed too.
  const reloadKey = options.reloadKey ?? null;
  const search = useDebounced(query.search, 300);
  const requestId = useRef(0);

  const load = useCallback(
    async (isRefresh = false) => {
      const mine = ++requestId.current;
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError(null);
      try {
        const page = await fetchListings({ type, category, search, sort }, 0);
        if (mine !== requestId.current) return;
        setListings(page);
        setHasMore(page.length === FEED_PAGE_SIZE);
      } catch (e) {
        if (mine !== requestId.current) return;
        setError(e instanceof Error ? e.message : 'Could not load listings');
        setListings([]);
      } finally {
        if (mine === requestId.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [type, category, search, sort, reloadKey],
  );

  const loadMore = useCallback(async () => {
    if (loading || loadingMore || refreshing || !hasMore) return;
    const mine = requestId.current;
    setLoadingMore(true);
    try {
      const page = await fetchListings({ type, category, search, sort }, listings.length);
      if (mine !== requestId.current) return;
      setListings((prev) => [...prev, ...page.filter((l) => !prev.some((p) => p.id === l.id))]);
      setHasMore(page.length === FEED_PAGE_SIZE);
    } catch {
      // Keep what's on screen; scrolling again retries.
    } finally {
      setLoadingMore(false);
    }
  }, [loading, loadingMore, refreshing, hasMore, type, category, search, sort, listings.length]);

  useEffect(() => {
    load();
  }, [load]);

  return { listings, loading, refreshing, loadingMore, error, refresh: () => load(true), loadMore };
}
