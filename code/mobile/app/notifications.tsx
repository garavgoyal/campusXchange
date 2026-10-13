import React, { useCallback, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { EmptyState } from '../src/components/ui/EmptyState';
import { ErrorText } from '../src/components/ui/ErrorText';
import { CATEGORIES } from '../src/constants/categories';
import { colors, radius, typography } from '../src/constants/colors';
import { useRealtimeRefresh } from '../src/lib/realtime';
import {
  fetchNotifications,
  fetchSubscriptions,
  markAllRead,
  markRead,
  saveSubscriptions,
  type AppNotification,
} from '../src/features/notifications/api';
import { useProfile } from '../src/features/profile/hooks';
import { formatClock, formatDay } from '../src/utils/formatTime';

const ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  listing_approved: 'checkmark-circle',
  listing_rejected: 'close-circle',
  id_verified: 'shield-checkmark',
  id_rejected: 'alert-circle',
  new_message: 'chatbubble-ellipses',
  new_offer: 'pricetag',
  offer_accepted: 'thumbs-up',
  offer_rejected: 'thumbs-down',
  deal_created: 'bag-check',
  payment_held: 'lock-closed',
  handoff_complete: 'qr-code',
  item_returned: 'return-down-back',
  deal_cancelled: 'ban',
  lend_due: 'alarm',
  dispute_opened: 'warning',
  dispute_update: 'help-circle',
  dispute_resolved: 'hammer',
  category_alert: 'sparkles',
};

/** Where tapping a notification takes you. */
function open(n: AppNotification) {
  const p = n.payload;
  if (p.transaction_id) return router.push({ pathname: '/deal/[id]', params: { id: p.transaction_id } });
  if (p.chat_id) return router.push({ pathname: '/chat/[id]', params: { id: p.chat_id } });
  if (n.type === 'listing_rejected' || n.type === 'listing_approved') return router.push('/(tabs)/history');
  if (p.listing_id) return router.push(`/listing/${p.listing_id}`);
  if (n.type === 'id_rejected') return router.push('/(auth)/id-card');
  return undefined;
}

export default function NotificationsScreen() {
  const { session } = useProfile();
  const userId = session?.user.id;
  const [items, setItems] = useState<AppNotification[]>([]);
  const [subs, setSubs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, categories] = await Promise.all([fetchNotifications(), fetchSubscriptions()]);
      setItems(list);
      setSubs(categories);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load notifications');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  useRealtimeRefresh(
    userId ? [{ table: 'notifications', filter: `user_id=eq.${userId}` }] : [],
    load,
    !!userId,
  );

  async function toggle(category: string) {
    const next = subs.includes(category) ? subs.filter((c) => c !== category) : [...subs, category];
    setSubs(next); // optimistic
    try {
      setSubs(await saveSubscriptions(next));
    } catch (e) {
      setSubs(subs);
      setError(e instanceof Error ? e.message : 'Could not save your alerts');
    }
  }

  async function tap(n: AppNotification) {
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      markRead(n.id).catch(() => undefined);
    }
    open(n);
  }

  async function readAll() {
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    try {
      await markAllRead();
    } catch {
      load();
    }
  }

  const hasUnread = items.some((n) => !n.read);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={styles.flex} />
        {hasUnread ? (
          <Pressable onPress={readAll} hitSlop={8}>
            <Text style={styles.readAll}>Mark all read</Text>
          </Pressable>
        ) : null}
      </View>

      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.primary} />}
        ListHeaderComponent={
          <View style={styles.alerts}>
            <Text style={styles.label}>CATEGORY ALERTS</Text>
            <Text style={styles.alertsSub}>Get notified when something new goes live in:</Text>
            <View style={styles.chips}>
              {CATEGORIES.map((c) => {
                const on = subs.includes(c);
                return (
                  <Pressable key={c} onPress={() => toggle(c)} style={[styles.chip, on && styles.chipOn]}>
                    <Ionicons
                      name={on ? 'notifications' : 'notifications-outline'}
                      size={12}
                      color={on ? colors.onBrand : colors.textMuted}
                    />
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{c}</Text>
                  </Pressable>
                );
              })}
            </View>
            <ErrorText>{error}</ErrorText>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : (
            <EmptyState icon="notifications-off-outline" title="All caught up" message="Updates on your listings, chats and deals appear here." />
          )
        }
        renderItem={({ item }) => (
          <Pressable style={[styles.item, !item.read && styles.unread]} onPress={() => tap(item)}>
            <View style={[styles.icon, !item.read && styles.iconUnread]}>
              <Ionicons
                name={ICONS[item.type] ?? 'notifications'}
                size={17}
                color={!item.read ? colors.primary : colors.textMuted}
              />
            </View>
            <View style={styles.body}>
              <Text style={styles.title}>{item.payload.title}</Text>
              <Text style={styles.text}>{item.payload.body}</Text>
              <Text style={styles.time}>
                {formatDay(item.created_at)} · {formatClock(item.created_at)}
              </Text>
            </View>
            {!item.read ? <View style={styles.dot} /> : null}
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingBottom: 10 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  readAll: { fontSize: 13, color: colors.primary, fontWeight: '600' },
  content: { padding: 16, gap: 8, paddingBottom: 40 },
  loader: { marginTop: 48 },
  alerts: {
    gap: 8,
    marginBottom: 8,
    padding: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
  },
  label: { ...typography.label, color: colors.textMuted },
  alertsSub: { fontSize: 13, color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 12, color: colors.textMuted, fontWeight: '600' },
  chipTextOn: { color: colors.onBrand },
  item: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    alignItems: 'flex-start',
  },
  unread: { borderColor: colors.primary },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceSunk,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconUnread: { backgroundColor: colors.primaryTint },
  body: { flex: 1, gap: 2 },
  title: { fontSize: 14, fontWeight: '700', color: colors.text },
  text: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  time: { fontSize: 11, color: colors.textFaint, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary, marginTop: 6 },
});
