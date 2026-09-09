import { File } from 'expo-file-system';
import { API_URL, apiGet, apiSend, authHeaders } from '../../lib/apiClient';
import type { ProfileMe, UploadIdCardResult } from './types';

/**
 * Sends the ID card photo to the backend, which stores it and flags it pending review.
 *
 * NOTE: Expo SDK 54+ replaces global fetch with its own implementation, whose FormData
 * converter accepts ONLY a Blob or an object exposing bytes() — the old React Native
 * `{ uri, name, type }` shape throws "Unsupported FormDataPart implementation".
 * `File` from expo-file-system provides name, type and bytes(), so it works directly.
 * Use this same pattern for listing photos later.
 */
export async function uploadIdCard(fileUri: string): Promise<UploadIdCardResult> {
  try {
    const headers = await authHeaders();
    const file = new File(fileUri);

    if (!file.exists) {
      return { error: 'That photo could not be read. Try picking it again.' };
    }

    const form = new FormData();
    form.append('file', file as unknown as Blob);

    const res = await fetch(`${API_URL}/profile/id-card`, {
      method: 'POST',
      headers,
      body: form,
    });

    if (!res.ok) {
      const body = await res.text();
      return { error: body || `Upload failed (${res.status})` };
    }
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Network error' };
  }
}

export async function getMyProfile(): Promise<ProfileMe | null> {
  try {
    return await apiGet<ProfileMe>('/profile/me');
  } catch {
    return null;
  }
}

/** Saves any subset of the editable profile fields. */
export async function updateProfile(patch: {
  name?: string;
  roll_number?: string;
}): Promise<{ error: string | null }> {
  try {
    await apiSend('/profile', 'PATCH', patch);
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not save your profile' };
  }
}
