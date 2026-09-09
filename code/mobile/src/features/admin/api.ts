import { apiGet, apiSend } from '../../lib/apiClient';
import type { IdVerificationItem, ModerationItem } from './types';

export async function fetchPendingListings(): Promise<ModerationItem[]> {
  return apiGet<ModerationItem[]>('/admin/moderation');
}

export async function approveListing(listingId: string) {
  return apiSend(`/admin/moderation/${listingId}/approve`, 'POST');
}

export async function rejectListing(listingId: string, reason: string) {
  return apiSend(`/admin/moderation/${listingId}/reject`, 'POST', { reason });
}

export async function fetchPendingIdVerifications(): Promise<IdVerificationItem[]> {
  return apiGet<IdVerificationItem[]>('/admin/id-verifications');
}

export async function decideIdVerification(
  userId: string,
  decision: 'verified' | 'rejected',
) {
  return apiSend(`/admin/id-verifications/${userId}`, 'POST', { decision });
}
