import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import { Button } from '../../src/components/ui/Button';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { ErrorText } from '../../src/components/ui/ErrorText';
import { ScreenTitle } from '../../src/components/ui/ScreenTitle';
import {
  approveListing,
  decideIdVerification,
  fetchPendingIdVerifications,
  fetchPendingListings,
  rejectListing,
} from '../../src/features/admin/api';
import type { IdVerificationItem, ModerationItem } from '../../src/features/admin/types';
import { colors } from '../../src/constants/colors';

type Tab = 'listings' | 'ids';

export default function AdminScreen() {
  const [tab, setTab] = useState<Tab>('listings');
  const [listings, setListings] = useState<ModerationItem[]>([]);
  const [ids, setIds] = useState<IdVerificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [queue, verifications] = await Promise.all([
        fetchPendingListings(),
        fetchPendingIdVerifications(),
      ]);
      setListings(queue);
      setIds(verifications);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the review queue');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function decideListing(listingId: string, approve: boolean) {
    setBusyId(listingId);
    setError(null);
    try {
      if (approve) await approveListing(listingId);
      else await rejectListing(listingId, 'Did not meet listing guidelines');
      setListings((prev) => prev.filter((item) => item.listing.id !== listingId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that decision');
    } finally {
      setBusyId(null);
    }
  }

  async function decideId(userId: string, decision: 'verified' | 'rejected') {
    setBusyId(userId);
    setError(null);
    try {
      await decideIdVerification(userId, decision);
      setIds((prev) => prev.filter((item) => item.id !== userId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that decision');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenTitle>Review queue</ScreenTitle>

        <View style={styles.tabs}>
          <Pressable
            onPress={() => setTab('listings')}
            style={[styles.tab, tab === 'listings' && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === 'listings' && styles.tabTextActive]}>
              Listings ({listings.length})
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setTab('ids')}
            style={[styles.tab, tab === 'ids' && styles.tabActive]}
          >
            <Text style={[styles.tabText, tab === 'ids' && styles.tabTextActive]}>
              ID cards ({ids.length})
            </Text>
          </Pressable>
        </View>

        <ErrorText>{error}</ErrorText>

        {loading ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : tab === 'listings' ? (
          listings.length === 0 ? (
            <EmptyState
              icon="checkmark-done-outline"
              title="Queue is clear"
              message="Every submitted listing has been reviewed."
            />
          ) : (
            listings.map((item) => (
              <View key={item.listing.id} style={styles.card}>
                <Text style={styles.cardTitle}>{item.listing.title}</Text>
                <Text style={styles.cardMeta}>
                  {item.listing.type} · {item.listing.category}
                  {item.listing.price != null ? ` · ₹${item.listing.price}` : ''}
                  {item.listing.rent_amount != null
                    ? ` · ₹${item.listing.rent_amount}/${item.listing.rent_unit}`
                    : ''}
                </Text>
                {item.listing.description ? (
                  <Text style={styles.cardBody}>{item.listing.description}</Text>
                ) : null}
                <Text style={styles.cardMeta}>
                  Meeting point: {item.listing.meeting_location ?? 'Not set'}
                </Text>
                <Text style={styles.flagScore}>
                  AI flag score: {item.ai_flag_score ?? 'not scored — human review'}
                </Text>
                <View style={styles.actions}>
                  <View style={styles.actionItem}>
                    <Button
                      label="Reject"
                      variant="outline"
                      loading={busyId === item.listing.id}
                      onPress={() => decideListing(item.listing.id, false)}
                    />
                  </View>
                  <View style={styles.actionItem}>
                    <Button
                      label="Approve"
                      loading={busyId === item.listing.id}
                      onPress={() => decideListing(item.listing.id, true)}
                    />
                  </View>
                </View>
              </View>
            ))
          )
        ) : ids.length === 0 ? (
          <EmptyState
            icon="checkmark-done-outline"
            title="No ID cards waiting"
            message="Uploaded student IDs awaiting review appear here."
          />
        ) : (
          ids.map((item) => (
            <View key={item.id} style={styles.card}>
              <Text style={styles.cardTitle}>{item.email}</Text>
              <Text style={styles.cardMeta}>
                Roll number: {item.roll_number ?? 'not provided'}
              </Text>
              {item.signed_url ? (
                <Image source={{ uri: item.signed_url }} style={styles.idImage} resizeMode="cover" />
              ) : (
                <Text style={styles.cardMeta}>Image unavailable</Text>
              )}
              <View style={styles.actions}>
                <View style={styles.actionItem}>
                  <Button
                    label="Reject"
                    variant="outline"
                    loading={busyId === item.id}
                    onPress={() => decideId(item.id, 'rejected')}
                  />
                </View>
                <View style={styles.actionItem}>
                  <Button
                    label="Verify"
                    loading={busyId === item.id}
                    onPress={() => decideId(item.id, 'verified')}
                  />
                </View>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  loader: { marginTop: 48 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  cardMeta: { color: colors.textMuted, fontSize: 13 },
  cardBody: { color: colors.text, fontSize: 14, lineHeight: 20 },
  flagScore: { color: colors.textMuted, fontSize: 12, fontStyle: 'italic' },
  idImage: { width: '100%', height: 170, borderRadius: 8, marginTop: 6 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  actionItem: { flex: 1 },
});
