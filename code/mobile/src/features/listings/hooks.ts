import { useCallback, useEffect, useState } from 'react';
import { fetchListings } from './api';
import type { Listing, ListingQuery } from './types';

export function useListings(query: ListingQuery) {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { type, category, search } = query;

  const load = useCallback(
    async (isRefresh = false) => {
      isRefresh ? setRefreshing(true) : setLoading(true);
      setError(null);
      try {
        setListings(await fetchListings({ type, category, search }));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not load listings');
        setListings([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [type, category, search],
  );

  useEffect(() => {
    load();
  }, [load]);

  return { listings, loading, refreshing, error, refresh: () => load(true) };
}
