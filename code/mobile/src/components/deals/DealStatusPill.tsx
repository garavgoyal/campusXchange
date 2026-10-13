import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../constants/colors';
import { STATUS_LABEL, type TransactionStatus } from '../../features/transactions/types';

const TONE: Record<TransactionStatus, { fg: string; bg: string }> = {
  pending_payment: { fg: colors.warning, bg: colors.warningTint },
  escrow_held: { fg: colors.primary, bg: colors.primaryTint },
  qr_issued: { fg: colors.primary, bg: colors.primaryTint },
  in_use: { fg: colors.accent, bg: colors.accentTint },
  completed: { fg: colors.success, bg: colors.successTint },
  disputed: { fg: colors.error, bg: colors.errorTint },
  refunded: { fg: colors.textMuted, bg: colors.surfaceSunk },
  cancelled: { fg: colors.textMuted, bg: colors.surfaceSunk },
};

export function DealStatusPill({ status }: { status: TransactionStatus }) {
  const tone = TONE[status] ?? TONE.cancelled;
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}>
      <Text style={[styles.text, { color: tone.fg }]}>{STATUS_LABEL[status] ?? status}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  text: { fontSize: 11, fontWeight: '700' },
});
