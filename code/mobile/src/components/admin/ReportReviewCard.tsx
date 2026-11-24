import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { colors, radius, fonts, shadow } from '../../constants/colors';
import type { AdminReport } from '../../features/reports/types';
import { formatClock, formatDay } from '../../utils/formatTime';
import { Button } from '../ui/Button';
import { ErrorText } from '../ui/ErrorText';

type Props = {
  item: AdminReport;
  busy: boolean;
  onResolve: (outcome: 'actioned' | 'dismissed', note: string) => void;
};

/**
 * One report in the admin queue: what was reported, by whom, how many others
 * reported the same thing. For a listing, "Take down" removes it from the feed
 * for good (and calls off a deal that hasn't reached the handoff).
 */
export function ReportReviewCard({ item, busy, onResolve }: Props) {
  const [note, setNote] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const isListing = !!item.listing_id || !!item.listing_title;

  function decide(outcome: 'actioned' | 'dismissed') {
    if (note.trim().length < 3) return setLocalError('Write a short note: the owner or the reporter sees it');
    setLocalError(null);
    onResolve(outcome, note.trim());
  }

  const listing = item.listing;
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.reason}>{item.reason_label}</Text>
        {item.open_reports_on_target > 1 ? (
          <Text style={styles.count}>{item.open_reports_on_target} reports</Text>
        ) : null}
      </View>

      {isListing ? (
        <Pressable
          disabled={!listing}
          onPress={() => listing && router.push({ pathname: '/listing/[id]', params: { id: listing.id } })}
          style={styles.target}
        >
          {listing?.images?.[0] ? (
            <Image source={{ uri: listing.images[0] }} style={styles.thumb} />
          ) : (
            <View style={[styles.thumb, styles.thumbEmpty]} />
          )}
          <View style={styles.flex}>
            <Text style={styles.title} numberOfLines={1}>
              {listing?.title ?? item.listing_title ?? 'Listing'}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {listing
                ? `${listing.type} · ${listing.status} · by ${listing.owner?.name ?? 'unknown'}`
                : 'The owner deleted this listing'}
            </Text>
          </View>
        </Pressable>
      ) : (
        <View style={styles.target}>
          <View style={styles.flex}>
            <Text style={styles.title}>{item.reported_user?.name ?? 'Student'}</Text>
            <Text style={styles.meta}>
              {item.reported_user?.email}
              {item.reported_user?.penalty_total ? ` · ₹${item.reported_user.penalty_total} in penalties` : ''}
            </Text>
          </View>
        </View>
      )}

      {item.details ? <Text style={styles.details}>“{item.details}”</Text> : null}
      <Text style={styles.meta}>
        Reported by {item.reporter?.name ?? 'a student'} · {formatDay(item.created_at)}, {formatClock(item.created_at)}
      </Text>

      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder={isListing && listing ? 'Reason, shown to the owner' : 'Note, shown to the reporter'}
        placeholderTextColor={colors.textFaint}
        maxLength={300}
        style={styles.input}
      />
      <ErrorText>{localError}</ErrorText>
      <View style={styles.row}>
        <View style={styles.flex}>
          <Button label="Dismiss" variant="outline" size="sm" loading={busy} onPress={() => decide('dismissed')} />
        </View>
        <View style={styles.flex}>
          <Button
            label={isListing ? (listing ? 'Take down' : 'Mark handled') : 'Mark handled'}
            size="sm"
            loading={busy}
            onPress={() => decide('actioned')}
            style={isListing && listing ? styles.danger : undefined}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.card,
    padding: 14,
    gap: 8, ...shadow.card,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reason: { fontSize: 15, fontFamily: fonts.extrabold, color: colors.error },
  count: {
    fontSize: 12,
    fontFamily: fonts.bold,
    color: colors.error,
    backgroundColor: colors.errorTint,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.chip,
    overflow: 'hidden',
  },
  target: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumb: { width: 48, height: 48, borderRadius: 8, backgroundColor: colors.surfaceSunk },
  thumbEmpty: { borderWidth: 1, borderColor: colors.border },
  title: { fontSize: 15, fontFamily: fonts.bold, color: colors.text },
  meta: { fontSize: 12, fontFamily: fonts.regular, color: colors.textMuted },
  details: { fontSize: 14, fontFamily: fonts.regular, color: colors.text, fontStyle: 'italic', lineHeight: 20 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 14, fontFamily: fonts.regular,
    color: colors.text,
  },
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
  danger: { backgroundColor: colors.error, borderColor: colors.error },
});
