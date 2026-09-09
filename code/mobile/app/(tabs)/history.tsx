import React, { useCallback, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Alert,
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
import { StatusBadge } from '../../src/components/listings/StatusBadge';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { ErrorText } from '../../src/components/ui/ErrorText';
import { SignInPrompt } from '../../src/components/ui/SignInPrompt';
import { deleteListing, fetchMyListings } from '../../src/features/listings/api';
import type { Listing } from '../../src/features/listings/types';
import { useProfile } from '../../src/features/profile/hooks';
import { colors, radius } from '../../src/constants/colors';

function priceLine(listing: Listing): string {
  if (listing.type === 'sell') return listing.price != null ? `₹${listing.price}` : 'Ask';
  if (listing.type === 'lend') {
    return listing.rent_amount != null
      ? `₹${listing.rent_amount} / ${listing.rent_unit ?? 'day'}`
      : 'Ask';
  }
  const tags = listing.want_tags ?? [];
  return tags.length ? `Wants ${tags.join(', ')}` : 'Open to offers';
}

export default function MyListingsScreen() {
  const { isSignedIn, loading: profileLoading } = useProfile();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isSignedIn) {
      setLoading(false);
      return;
    }
    setError(null);
    try {
      setListings(await fetchMyListings());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your listings');
    } finally {
      setLoading(false);
    }
  }, [isSignedIn]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function confirmDelete(listing: Listing) {
    Alert.alert(
      'Delete this listing?',
      `"${listing.title}" will be removed from the campus feed. This can't be undone.`,
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBusyId(listing.id);
            setError(null);
            try {
              const { deleted } = await deleteListing(listing.id);
              await load();
              if (!deleted) {
                Alert.alert(
                  'Removed from the feed',
                  'This listing already had a conversation, so it was withdrawn rather than erased — deleting it outright would have wiped both students’ messages.',
                );
              }
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not delete that listing');
            } finally {
              setBusyId(null);
            }
          },
        },
      ],
    );
  }

  if (!profileLoading && !isSignedIn) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.head}>
          <Text style={styles.screenTitle}>My listings</Text>
        </View>
        <View style={styles.centered}>
          <SignInPrompt action="see your listings" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <FlatList
        data={listings}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={() => <View style={styles.sep} />}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={load} tintColor={colors.primary} />
        }
        ListHeaderComponent={
          <View style={styles.head}>
            <Text style={styles.screenTitle}>My listings</Text>
            <Text style={styles.screenSub}>Everything you&apos;ve posted, and its review status</Text>
            <ErrorText>{error}</ErrorText>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Pressable
              style={styles.cardMain}
              onPress={() =>
                item.status === 'live' ? router.push(`/listing/${item.id}`) : undefined
              }
            >
              {item.images[0] ? (
                <Image source={{ uri: item.images[0] }} style={styles.thumb} />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]}>
                  <Ionicons name="image-outline" size={18} color={colors.textFaint} />
                </View>
              )}
              <View style={styles.body}>
                <Text style={styles.title} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.price}>{priceLine(item)}</Text>
                <View style={styles.badgeRow}>
                  <StatusBadge status={item.status} />
                </View>
              </View>
            </Pressable>

            <Pressable
              style={styles.delete}
              onPress={() => confirmDelete(item)}
              disabled={busyId === item.id}
              hitSlop={6}
              accessibilityLabel={`Delete ${item.title}`}
            >
              {busyId === item.id ? (
                <ActivityIndicator size="small" color={colors.error} />
              ) : (
                <Ionicons name="trash-outline" size={17} color={colors.error} />
              )}
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator color={colors.primary} style={styles.loader} />
          ) : (
            <EmptyState
              icon="pricetags-outline"
              title="Nothing posted yet"
              message="Tap the + button to list your first item. It'll appear here with its review status."
            />
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, justifyContent: 'center' },
  content: { paddingHorizontal: 16, paddingBottom: 24 },
  head: { paddingTop: 4, paddingBottom: 16 },
  screenTitle: { fontSize: 24, fontWeight: '800', color: colors.text },
  screenSub: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  sep: { height: 10 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: 10,
    gap: 8,
  },
  cardMain: { flex: 1, flexDirection: 'row', gap: 12, alignItems: 'center' },
  thumb: { width: 62, height: 62, borderRadius: 12, backgroundColor: colors.surfaceSunk },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 3 },
  title: { fontSize: 14, fontWeight: '700', color: colors.text },
  price: { fontSize: 13, fontWeight: '700', color: colors.primary },
  badgeRow: { flexDirection: 'row', marginTop: 2 },
  delete: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.errorTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loader: { marginTop: 48 },
});
