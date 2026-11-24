import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { getSupabaseAdmin } from '../../database/supabase.client.js';

export type CampusLocation = {
  name: string;
  kind: 'hostel' | 'spot';
  category: string | null;
  old_name: string | null;
  description: string | null;
  lat: number | null;
  lng: number | null;
  aliases: string[];
  sort_order: number;
};

const CACHE_MS = 5 * 60 * 1000;

/** Metres between two points (haversine) — same formula as cx_distance_m in SQL. */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

/**
 * Hostels and campus meeting points (migration 008, from the TIET campus map).
 * Rarely changes, so it is cached in memory for a few minutes.
 */
@Injectable()
export class CampusService {
  private readonly logger = new Logger(CampusService.name);
  private cache: { at: number; rows: CampusLocation[] } | null = null;

  async all(): Promise<CampusLocation[]> {
    if (this.cache && Date.now() - this.cache.at < CACHE_MS) return this.cache.rows;
    const { data, error } = await getSupabaseAdmin()
      .from('campus_locations')
      .select('name, kind, category, old_name, description, lat, lng, aliases, sort_order')
      .order('kind', { ascending: true })
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) {
      this.logger.warn(`Campus locations unavailable: ${error.message}`);
      return this.cache?.rows ?? [];
    }
    this.cache = { at: Date.now(), rows: (data ?? []) as CampusLocation[] };
    return this.cache.rows;
  }

  /** The real hostel row for a name the student picked, or null if it isn't one. */
  async hostel(name: string): Promise<CampusLocation | null> {
    const rows = await this.all();
    return rows.find((r) => r.kind === 'hostel' && r.name === name) ?? null;
  }

  /**
   * FR-LST-4: a listing's meeting point must be one of the campus places.
   * Accepts the name or an older alias (any case) and returns the place's
   * current name, so "hostel block b" is stored as "Amritam Hall". Empty means
   * "not set". If the campus list itself can't be loaded (migration 008 not
   * run), the text is kept as typed rather than blocking every listing.
   */
  async meetingPoint(input: string | null | undefined): Promise<string | null> {
    const text = input?.trim();
    if (!text) return null;
    const rows = await this.all();
    if (!rows.length) return text;
    const place = this.match(rows, text);
    if (!place) {
      throw new BadRequestException('Choose a meeting point from the campus list');
    }
    return place.name;
  }

  /** Finds a meeting point by its name or an older alias, case-insensitively. */
  private match(rows: CampusLocation[], meetingLocation: string | null | undefined) {
    const key = meetingLocation?.trim().toLowerCase();
    if (!key) return null;
    return (
      rows.find((r) => r.name.toLowerCase() === key) ??
      rows.find((r) => r.aliases.some((a) => a.toLowerCase() === key)) ??
      null
    );
  }

  /**
   * A function that gives metres from the student's hostel to a meeting point,
   * or null when either position is unknown.
   */
  async distanceFrom(hostelName: string | null | undefined) {
    const rows = await this.all();
    const home = hostelName ? rows.find((r) => r.name === hostelName) : null;
    return (meetingLocation: string | null | undefined): number | null => {
      if (!home || home.lat == null || home.lng == null) return null;
      const place = this.match(rows, meetingLocation);
      if (!place || place.lat == null || place.lng == null) return null;
      return Math.round(distanceM({ lat: home.lat, lng: home.lng }, { lat: place.lat, lng: place.lng }));
    };
  }
}
