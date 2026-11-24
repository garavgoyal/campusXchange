import { apiGet } from '../../lib/apiClient';
import type { CampusLocation } from './types';

let cached: Promise<CampusLocation[]> | null = null;

/** Hostels and meeting points. Fetched once per app session; public, no sign-in needed. */
export function fetchCampusLocations(): Promise<CampusLocation[]> {
  if (!cached) {
    cached = apiGet<CampusLocation[]>('/campus/locations').catch((e) => {
      cached = null; // try again next time
      throw e;
    });
  }
  return cached;
}
