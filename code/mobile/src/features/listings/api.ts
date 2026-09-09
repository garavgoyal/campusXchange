import { File } from 'expo-file-system';
import { API_URL, apiGet, apiSend, authHeaders } from '../../lib/apiClient';
import type { CreateListingInput, Listing, ListingQuery } from './types';

/** Public — works signed out, but the backend withholds meeting_location for guests. */
export async function fetchListings(query: ListingQuery): Promise<Listing[]> {
  const params = new URLSearchParams({ type: query.type });
  if (query.category) params.set('category', query.category);
  if (query.search) params.set('search', query.search);
  return apiGet<Listing[]>(`/listings?${params.toString()}`);
}

export async function fetchListing(id: string): Promise<Listing> {
  return apiGet<Listing>(`/listings/${id}`);
}

/** The caller's own listings at any status, so "pending review" is visible to them. */
export async function fetchMyListings(): Promise<Listing[]> {
  return apiGet<Listing[]>('/listings/mine');
}

/** Creates the listing as pending_review and enqueues it for moderation. */
export async function createListing(input: CreateListingInput): Promise<Listing> {
  return apiSend<Listing>('/listings', 'POST', input);
}

/**
 * Uploads one listing photo and returns its public URL.
 *
 * Same Expo SDK 54+ constraint as the ID card upload: the built-in fetch only
 * accepts a Blob or an object with bytes(), so we hand it a `File`.
 */
export async function uploadListingImage(fileUri: string): Promise<string> {
  const file = new File(fileUri);
  if (!file.exists) throw new Error('That photo could not be read');

  const form = new FormData();
  form.append('file', file as unknown as Blob);

  const res = await fetch(`${API_URL}/listings/images`, {
    method: 'POST',
    headers: await authHeaders(),
    body: form,
  });

  if (!res.ok) throw new Error((await res.text()) || `Upload failed (${res.status})`);
  const { url } = (await res.json()) as { url: string };
  return url;
}

/**
 * Removes one of your own listings. The backend hard-deletes it when nothing
 * references it, or marks it `removed` if a conversation already exists — so a
 * delete can never wipe out someone else's message history.
 */
export async function deleteListing(id: string): Promise<{ deleted: boolean }> {
  const res = await fetch(`${API_URL}/listings/${id}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error((await res.text()) || `Could not delete (${res.status})`);
  return (await res.json()) as { deleted: boolean };
}
