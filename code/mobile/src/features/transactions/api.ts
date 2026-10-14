import { File } from 'expo-file-system';
import { API_URL, apiGet, apiSend, authHeaders } from '../../lib/apiClient';
import type {
  AdminDispute,
  ConditionPhoto,
  CreateDealInput,
  Deal,
  DealSummary,
  PhotoStage,
  QrTicket,
} from './types';

export async function fetchMyDeals(): Promise<DealSummary[]> {
  return apiGet<DealSummary[]>('/transactions');
}

export async function fetchDeal(id: string): Promise<Deal> {
  return apiGet<Deal>(`/transactions/${id}`);
}

export async function fetchDealForChat(
  chatId: string,
): Promise<{ transaction: { id: string; status: string } | null }> {
  return apiGet(`/transactions/by-chat/${chatId}`);
}

/** Seller locks the agreed price in with this buyer. */
export async function createDeal(input: CreateDealInput): Promise<Deal> {
  return apiSend<Deal>('/transactions', 'POST', input);
}

/** Simulated escrow — records the hold, no real money moves. */
export async function payDeal(id: string): Promise<Deal> {
  return apiSend<Deal>(`/transactions/${id}/pay`, 'POST');
}

export async function issueQr(id: string): Promise<QrTicket> {
  return apiSend<QrTicket>(`/transactions/${id}/qr`, 'POST');
}

export async function scanQr(id: string, token: string): Promise<Deal> {
  return apiSend<Deal>(`/transactions/${id}/scan`, 'POST', { token });
}

export async function cancelDeal(id: string): Promise<Deal> {
  return apiSend<Deal>(`/transactions/${id}/cancel`, 'POST');
}

export async function raiseDispute(id: string, reason: string): Promise<Deal> {
  return apiSend<Deal>(`/transactions/${id}/dispute`, 'POST', { reason });
}

/** Same Expo fetch constraint as listing photos: hand FormData a `File`. */
export async function uploadConditionPhoto(
  id: string,
  stage: PhotoStage,
  fileUri: string,
): Promise<ConditionPhoto> {
  const file = new File(fileUri);
  if (!file.exists) throw new Error('That photo could not be read');

  const form = new FormData();
  form.append('stage', stage);
  form.append('file', file as unknown as Blob);

  const res = await fetch(`${API_URL}/transactions/${id}/photos`, {
    method: 'POST',
    headers: await authHeaders(),
    body: form,
  });
  if (!res.ok) {
    let message = `Upload failed (${res.status})`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (body.message) message = Array.isArray(body.message) ? body.message.join(', ') : body.message;
    } catch {
      /* keep default */
    }
    throw new Error(message);
  }
  return (await res.json()) as ConditionPhoto;
}

// ---- admin ----

export async function fetchOpenDisputes(): Promise<AdminDispute[]> {
  return apiGet<AdminDispute[]>('/admin/disputes');
}

export async function requestEvidence(disputeId: string, note: string) {
  return apiSend(`/admin/disputes/${disputeId}/review`, 'POST', { note });
}

export async function resolveDispute(
  disputeId: string,
  input: {
    outcome: 'release' | 'refund';
    resolution: string;
    penalty_amount?: number;
    penalty_party?: 'buyer' | 'seller';
  },
) {
  return apiSend(`/admin/disputes/${disputeId}/resolve`, 'POST', input);
}
