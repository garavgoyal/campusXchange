import React, { useCallback, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { DealStatusPill } from '../src/components/deals/DealStatusPill';
import { EmptyState } from '../src/components/ui/EmptyState';
import { ErrorText } from '../src/components/ui/ErrorText';
import { colors, radius } from '../src/constants/colors';
import { fetchMyDeals } from '../src/features/transactions/api';
import { ACTIVE_STATUSES, type DealSummary } from '../src/features/transactions/types';

/** Every deal you are buying, selling, borrowing or lending — active ones first. */
export default function DealsScreen() {
  const [deals, setDeals] = useState<DealSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const all = await fetchMyDeals();
      const active = all.filter((d) => ACTIVE_STATUSES.includes(d.status));
      const done = all.filter((d) => !ACTIVE_STATUSES.includes(d.status));
      setDeals([...active, ...done]);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your deals');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>My deals</Text>
      </View>

      <FlatList
        data={deals}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.primary} />}
        ListHeaderComponent={<ErrorText>{error}</ErrorText>}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : (
            <EmptyState
              icon="swap-horizontal-outline"
              title="No deals yet"
              message="When a seller finalises a deal with you — or you with a buyer — it shows up here."
            />
          )
        }
        renderItem={({ item }) => {
          const buying = item.my_role === 'buyer';
          const verb =
            item.type === 'lend' ? (buying ? 'Borrowing' : 'Lending')
            : item.type === 'exchange' ? 'Exchange'
            : buying ? 'Buying' : 'Selling';
          return (
            <Pressable
              style={styles.card}
              onPress={() => router.push({ pathname: '/deal/[id]', params: { id: item.id } })}
            >
              {item.listing?.images?.[0] ? (
                <Image source={{ uri: item.listing.images[0] }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]}>
                  <Ionicons name="image-outline" size={16} color={colors.textFaint} />
                </View>
              )}
              <View style={styles.body}>
                <Text style={styles.title} numberOfLines={1}>
                  {item.listing?.title ?? 'Item'}
                </Text>
                <Text style={styles.meta}>
                  {verb} · ₹{Number(item.agreed_price).toLocaleString('en-IN')}
                </Text>
                <DealStatusPill status={item.status} />
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </Pressable>
          );
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingBottom: 10 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  loader: { marginTop: 48 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
  },
  thumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: colors.surfaceSunk },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 4 },
  title: { fontSize: 15, fontWeight: '700', color: colors.text },
  meta: { fontSize: 12, color: colors.textMuted },
});
