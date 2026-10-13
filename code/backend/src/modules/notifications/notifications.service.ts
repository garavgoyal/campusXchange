import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { getSupabaseAdmin } from '../../database/supabase.client.js';

/** Every notification type the app knows how to render. */
export type NotificationType =
  | 'listing_approved'
  | 'listing_rejected'
  | 'id_verified'
  | 'id_rejected'
  | 'new_message'
  | 'new_offer'
  | 'offer_accepted'
  | 'offer_rejected'
  | 'deal_created'
  | 'payment_held'
  | 'handoff_complete'
  | 'item_returned'
  | 'deal_cancelled'
  | 'lend_due'
  | 'dispute_opened'
  | 'dispute_update'
  | 'dispute_resolved'
  | 'category_alert';

export type NotificationPayload = {
  title: string;
  body: string;
  listing_id?: string;
  chat_id?: string;
  transaction_id?: string;
  dispute_id?: string;
};

const NOTIFICATION_COLUMNS = 'id, user_id, type, payload, read, created_at';

/**
 * In-app notifications (the `notifications` table, Level-1 DFD store D7).
 *
 * Sending a notification is always best-effort: a failure is logged and
 * swallowed, so a notification problem can never roll back or fail the action
 * that triggered it (approving a listing, paying, etc.).
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  async notify(userId: string, type: NotificationType, payload: NotificationPayload) {
    await this.notifyMany([userId], type, payload);
  }

  async notifyMany(userIds: string[], type: NotificationType, payload: NotificationPayload) {
    const unique = [...new Set(userIds.filter(Boolean))];
    if (!unique.length) return;
    try {
      const { error } = await getSupabaseAdmin()
        .from('notifications')
        .insert(unique.map((user_id) => ({ user_id, type, payload, read: false })));
      if (error) this.logger.warn(`Notification (${type}) not saved: ${error.message}`);
    } catch (e) {
      this.logger.warn(`Notification (${type}) failed: ${(e as Error).message}`);
    }
  }

  /** Disputes need a moderator's attention, so every admin hears about them. */
  async notifyAdmins(type: NotificationType, payload: NotificationPayload) {
    const { data } = await getSupabaseAdmin().from('users').select('id').eq('role', 'admin');
    await this.notifyMany((data ?? []).map((u) => u.id as string), type, payload);
  }

  /**
   * Chat messages are frequent, so collapse them: if this user already has an
   * unread "new message" for the same chat, don't stack another one.
   */
  async notifyNewMessage(userId: string, chatId: string, listingTitle: string, preview: string) {
    try {
      const { data: existing } = await getSupabaseAdmin()
        .from('notifications')
        .select('id')
        .eq('user_id', userId)
        .eq('type', 'new_message')
        .eq('read', false)
        .eq('payload->>chat_id', chatId)
        .limit(1);
      if (existing?.length) return;
    } catch {
      /* fall through and notify */
    }
    await this.notify(userId, 'new_message', {
      title: `New message · ${listingTitle}`,
      body: preview.length > 90 ? `${preview.slice(0, 87)}...` : preview,
      chat_id: chatId,
    });
  }

  /** "Get matched": tell subscribers when a listing in their category goes live. */
  async notifyCategorySubscribers(listing: {
    id: string;
    owner_id: string;
    title: string;
    category: string;
    type: string;
  }) {
    const { data } = await getSupabaseAdmin()
      .from('category_subscriptions')
      .select('user_id')
      .eq('category', listing.category);

    const recipients = (data ?? [])
      .map((row) => row.user_id as string)
      .filter((id) => id !== listing.owner_id);

    const verb = listing.type === 'lend' ? 'to borrow' : listing.type === 'exchange' ? 'to swap' : 'for sale';
    await this.notifyMany(recipients, 'category_alert', {
      title: `New in ${listing.category}`,
      body: `"${listing.title}" is now available ${verb}.`,
      listing_id: listing.id,
    });
  }

  // ---------------------------------------------------------------------------
  // Reading — used by NotificationsController
  // ---------------------------------------------------------------------------

  async list(userId: string) {
    await this.createDueReminders(userId);

    const { data, error } = await getSupabaseAdmin()
      .from('notifications')
      .select(NOTIFICATION_COLUMNS)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  async unreadCount(userId: string) {
    const { count, error } = await getSupabaseAdmin()
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('read', false);

    if (error) throw new BadRequestException(error.message);
    return { unread: count ?? 0 };
  }

  async markRead(userId: string, notificationId: string) {
    const { error } = await getSupabaseAdmin()
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId)
      .eq('user_id', userId);
    if (error) throw new BadRequestException(error.message);
    return { ok: true };
  }

  async markAllRead(userId: string) {
    const { error } = await getSupabaseAdmin()
      .from('notifications')
      .update({ read: true })
      .eq('user_id', userId)
      .eq('read', false);
    if (error) throw new BadRequestException(error.message);
    return { ok: true };
  }

  async getSubscriptions(userId: string) {
    const { data, error } = await getSupabaseAdmin()
      .from('category_subscriptions')
      .select('category')
      .eq('user_id', userId);
    if (error) throw new BadRequestException(error.message);
    return { categories: (data ?? []).map((row) => row.category as string) };
  }

  /** Replaces the user's whole subscription set with `categories`. */
  async setSubscriptions(userId: string, categories: string[]) {
    const supabase = getSupabaseAdmin();
    const wanted = [...new Set(categories.map((c) => c.trim()).filter(Boolean))];

    const { error: deleteError } = await supabase
      .from('category_subscriptions')
      .delete()
      .eq('user_id', userId);
    if (deleteError) throw new BadRequestException(deleteError.message);

    if (wanted.length) {
      const { error } = await supabase
        .from('category_subscriptions')
        .insert(wanted.map((category) => ({ user_id: userId, category })));
      if (error) throw new BadRequestException(error.message);
    }
    return { categories: wanted };
  }

  /**
   * Lend reminders are created lazily when the user opens their inbox: any
   * item they are borrowing that is due within a day gets one "due" notice.
   * No scheduler or cron job is needed for the pilot.
   */
  private async createDueReminders(userId: string) {
    try {
      const supabase = getSupabaseAdmin();
      const { data: borrowing } = await supabase
        .from('transactions')
        .select('id, listing_id')
        .eq('buyer_id', userId)
        .eq('type', 'lend')
        .eq('status', 'in_use');
      if (!borrowing?.length) return;

      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const { data: due } = await supabase
        .from('lend_details')
        .select('transaction_id, end_date')
        .in('transaction_id', borrowing.map((t) => t.id))
        .lte('end_date', tomorrow);
      if (!due?.length) return;

      const { data: already } = await supabase
        .from('notifications')
        .select('payload')
        .eq('user_id', userId)
        .eq('type', 'lend_due');
      const reminded = new Set(
        (already ?? []).map((n) => (n.payload as NotificationPayload).transaction_id),
      );

      for (const item of due) {
        if (reminded.has(item.transaction_id)) continue;
        const today = new Date().toISOString().slice(0, 10);
        const overdue = (item.end_date as string) < today;
        await this.notify(userId, 'lend_due', {
          title: overdue ? 'Borrowed item is overdue' : 'Borrowed item due soon',
          body: overdue
            ? `It was due back on ${item.end_date}. Arrange the return with the lender.`
            : `Please return it by ${item.end_date}.`,
          transaction_id: item.transaction_id as string,
        });
      }
    } catch (e) {
      this.logger.warn(`Due reminders skipped: ${(e as Error).message}`);
    }
  }
}
