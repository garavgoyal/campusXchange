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
import { useFocusEffect } from 'expo-router';
import { ReportReviewCard } from '../../src/components/admin/ReportReviewCard';
import { StatsCard } from '../../src/components/admin/StatsCard';
import { PhotoGallery } from '../../src/components/listings/PhotoGallery';
import { Button } from '../../src/components/ui/Button';
import { EmptyState } from '../../src/components/ui/EmptyState';
import { ErrorText } from '../../src/components/ui/ErrorText';
import { ScreenTitle } from '../../src/components/ui/ScreenTitle';
import {
  approveListing,
  decideIdVerification,
  fetchAdminStats,
  fetchPendingIdVerifications,
  fetchPendingListings,
  rejectListing,
} from '../../src/features/admin/api';
import type { AdminStats, IdVerificationItem, ModerationItem } from '../../src/features/admin/types';
import { DisputeReviewCard } from '../../src/components/deals/DisputeReviewCard';
import {
  fetchOpenDisputes,
  requestEvidence,
  resolveDispute,
} from '../../src/features/transactions/api';
import type { AdminDispute } from '../../src/features/transactions/types';
import { fetchOpenReports, resolveReport } from '../../src/features/reports/api';
import type { AdminReport } from '../../src/features/reports/types';
import { colors, fonts, shadow } from '../../src/constants/colors';
import { Screen } from '../../src/components/ui/Screen';

type Tab = 'dashboard' | 'listings' | 'ids' | 'reports' | 'disputes';

export default function AdminScreen() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [listings, setListings] = useState<ModerationItem[]>([]);
  const [ids, setIds] = useState<IdVerificationItem[]>([]);
  const [disputes, setDisputes] = useState<AdminDispute[]>([]);
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [queue, verifications, open] = await Promise.all([
        fetchPendingListings(),
        fetchPendingIdVerifications(),
        fetchOpenDisputes(),
      ]);
      setListings(queue);
      setIds(verifications);
      setDisputes(open);
      // Reports need migration 011; an older database just shows none.
      fetchOpenReports().then(setReports).catch(() => setReports([]));
      // Analytics are a bonus — never block the queue on them.
      fetchAdminStats().then(setStats).catch(() => setStats(null));
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

  async function decideReport(item: AdminReport, outcome: 'actioned' | 'dismissed', note: string) {
    setBusyId(item.id);
    setError(null);
    setNotice(null);
    try {
      await resolveReport(item.id, outcome, note);
      // Taking a listing down also closes every other open report on it.
      setReports((prev) =>
        prev.filter((r) => r.id !== item.id && !(outcome === 'actioned' && item.listing_id && r.listing_id === item.listing_id)),
      );
      if (outcome === 'actioned' && item.listing) setNotice(`"${item.listing.title}" was taken down.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that decision');
    } finally {
      setBusyId(null);
    }
  }

  async function askEvidence(disputeId: string, note: string) {
    setBusyId(disputeId);
    setError(null);
    try {
      await requestEvidence(disputeId, note);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send that request');
    } finally {
      setBusyId(null);
    }
  }

  async function decideDispute(
    disputeId: string,
    input: Parameters<typeof resolveDispute>[1],
  ) {
    setBusyId(disputeId);
    setError(null);
    try {
      await resolveDispute(disputeId, input);
      setDisputes((prev) => prev.filter((d) => d.id !== disputeId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not resolve that dispute');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Screen style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <ScreenTitle>Admin</ScreenTitle>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
          {(
            [
              ['dashboard', 'Dashboard'],
              ['listings', `Listings ${listings.length}`],
              ['ids', `IDs ${ids.length}`],
              ['reports', `Reports ${reports.length}`],
              ['disputes', `Disputes ${disputes.length}`],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <Pressable
              key={key}
              onPress={() => setTab(key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === key }}
              style={[styles.tab, tab === key && styles.tabActive]}
            >
              <Text style={[styles.tabText, tab === key && styles.tabTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <ErrorText>{error}</ErrorText>
        {notice ? <Text style={styles.notice}>{notice}</Text> : null}

        {loading ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : tab === 'dashboard' ? (
          stats ? (
            <StatsCard stats={stats} />
          ) : (
            <EmptyState
              icon="stats-chart-outline"
              title="No numbers yet"
              message="Metrics appear once listings have been reviewed and deals made."
            />
          )
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
                {item.listing.images?.length ? <PhotoGallery images={item.listing.images} height={180} /> : null}
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
        ) : tab === 'reports' ? (
          reports.length === 0 ? (
            <EmptyState
              icon="flag-outline"
              title="No open reports"
              message="Listings and students reported by others appear here."
            />
          ) : (
            reports.map((item) => (
              <ReportReviewCard
                key={item.id}
                item={item}
                busy={busyId === item.id}
                onResolve={(outcome, note) => decideReport(item, outcome, note)}
              />
            ))
          )
        ) : tab === 'disputes' ? (
          disputes.length === 0 ? (
            <EmptyState
              icon="checkmark-done-outline"
              title="No open disputes"
              message="Reported deals appear here with their condition photos."
            />
          ) : (
            disputes.map((item) => (
              <DisputeReviewCard
                key={item.id}
                item={item}
                busy={busyId === item.id}
                onAskEvidence={(note) => askEvidence(item.id, note)}
                onResolve={(input) => decideDispute(item.id, input)}
              />
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
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: 'center', ...shadow.card,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { color: colors.textMuted, fontSize: 13, fontFamily: fonts.semibold },
  tabTextActive: { color: '#fff' },
  loader: { marginTop: 48 },
  notice: { color: colors.success, fontSize: 13, fontFamily: fonts.semibold },
  card: {
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: 14,
    padding: 14,
    gap: 6, ...shadow.card,
  },
  cardTitle: { color: colors.text, fontSize: 16, fontFamily: fonts.bold },
  cardMeta: { color: colors.textMuted, fontSize: 13, fontFamily: fonts.regular },
  cardBody: { color: colors.text, fontSize: 14, fontFamily: fonts.regular, lineHeight: 20 },
  flagScore: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.regular, fontStyle: 'italic' },
  idImage: { width: '100%', height: 170, borderRadius: 8, marginTop: 6 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  actionItem: { flex: 1 },
});
