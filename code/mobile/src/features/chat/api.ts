import { apiGet, apiSend } from '../../lib/apiClient';
import type { ChatMessage, ChatThread, Offer, ThreadEntry } from './types';

export async function fetchChats(): Promise<ChatThread[]> {
  return apiGet<ChatThread[]>('/chats');
}

/** Idempotent — returns the existing thread if one already exists for this listing. */
export async function startChat(listingId: string): Promise<{ id: string }> {
  return apiSend<{ id: string }>('/chats', 'POST', { listing_id: listingId });
}

export async function fetchMessages(chatId: string): Promise<ChatMessage[]> {
  return apiGet<ChatMessage[]>(`/chats/${chatId}/messages`);
}

export async function sendMessage(chatId: string, content: string): Promise<ChatMessage> {
  return apiSend<ChatMessage>(`/chats/${chatId}/messages`, 'POST', { content });
}

export async function fetchOffers(chatId: string): Promise<Offer[]> {
  return apiGet<Offer[]>(`/chats/${chatId}/offers`);
}

export async function sendOffer(chatId: string, price: number): Promise<Offer> {
  return apiSend<Offer>(`/chats/${chatId}/offers`, 'POST', { offered_price: price });
}

export async function acceptOffer(offerId: string): Promise<Offer> {
  return apiSend<Offer>(`/chats/offers/${offerId}/accept`, 'POST');
}

export async function rejectOffer(offerId: string): Promise<Offer> {
  return apiSend<Offer>(`/chats/offers/${offerId}/reject`, 'POST');
}

/** Loads both halves of the conversation and interleaves them by timestamp. */
export async function fetchThread(chatId: string): Promise<ThreadEntry[]> {
  const [messages, offers] = await Promise.all([fetchMessages(chatId), fetchOffers(chatId)]);

  const entries: ThreadEntry[] = [
    ...messages.map((message) => ({ kind: 'message' as const, at: message.sent_at, message })),
    ...offers.map((offer) => ({ kind: 'offer' as const, at: offer.created_at, offer })),
  ];

  return entries.sort((a, b) => a.at.localeCompare(b.at));
}
