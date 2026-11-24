import { useEffect, useState } from 'react';
import { fetchCampusLocations } from './api';
import type { CampusLocation } from './types';

export function useCampusLocations() {
  const [all, setAll] = useState<CampusLocation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchCampusLocations()
      .then((rows) => alive && setAll(rows))
      .catch(() => alive && setAll([]))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  return {
    loading,
    hostels: all.filter((l) => l.kind === 'hostel'),
    spots: all.filter((l) => l.kind === 'spot'),
  };
}
