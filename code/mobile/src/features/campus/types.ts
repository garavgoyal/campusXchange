/** A hostel or meeting point on campus (GET /campus/locations, from the TIET campus map). */
export type CampusLocation = {
  name: string;
  kind: 'hostel' | 'spot';
  category: string | null;
  /** e.g. "Hostel-A" for Agira Hall */
  old_name: string | null;
  description: string | null;
  lat: number | null;
  lng: number | null;
};
