import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../constants/colors';
import type { ListingStatus } from '../../features/listings/types';

const LABELS: Record<ListingStatus, string> = {
  draft: 'Draft',
  pending_review: 'Pending review',
  live: 'Live',
  reserved: 'Reserved',
  completed: 'Completed',
  removed: 'Rejected',
};

const TONES: Record<ListingStatus, string> = {
  draft: colors.textMuted,
  pending_review: colors.warning,
  live: colors.success,
  reserved: colors.primary,
  completed: colors.textMuted,
  removed: colors.error,
};

export function StatusBadge({ status }: { status: ListingStatus }) {
  const tone = TONES[status];
  return (
    <View style={[styles.badge, { borderColor: tone }]}>
      <Text style={[styles.text, { color: tone }]}>{LABELS[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  text: { fontSize: 11, fontWeight: '600' },
});
