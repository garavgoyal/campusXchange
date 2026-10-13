import { apiGet, apiSend } from '../../lib/apiClient';

export type AppNotification = {
  id: string;
  user_id: string;
  type: string;
  payload: {
    title: string;
    body: string;
    listing_id?: string;
    chat_id?: string;
    transaction_id?: string;
    dispute_id?: string;
  };
  read: boolean;
  created_at: string;
};

export async function fetchNotifications(): Promise<AppNotification[]> {
  return apiGet<AppNotification[]>('/notifications');
}

export async function fetchUnreadCount(): Promise<number> {
  const { unread } = await apiGet<{ unread: number }>('/notifications/unread-count');
  return unread;
}

export async function markRead(id: string) {
  return apiSend(`/notifications/${id}/read`, 'POST');
}

export async function markAllRead() {
  return apiSend('/notifications/read-all', 'POST');
}

export async function fetchSubscriptions(): Promise<string[]> {
  const { categories } = await apiGet<{ categories: string[] }>('/notifications/subscriptions');
  return categories;
}

export async function saveSubscriptions(categories: string[]): Promise<string[]> {
  const res = await apiSend<{ categories: string[] }>('/notifications/subscriptions', 'PUT', {
    categories,
  });
  return res.categories;
}
