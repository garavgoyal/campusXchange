import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, typography } from '../../constants/colors';
import type { Offer } from '../../features/chat/types';

type Props = {
  offer: Offer;
  mine: boolean;
  busy: boolean;
  askingPrice?: number | null;
  meetingLocation?: string | null;
  onAccept: () => void;
  onCounter: () => void;
  onReject: () => void;
};

export function OfferCard({
  offer,
  mine,
  busy,
  askingPrice,
  meetingLocation,
  onAccept,
  onCounter,
  onReject,
}: Props) {
  const accepted = offer.status === 'accepted';
  const rejected = offer.status === 'rejected';
  const actionable = offer.status === 'pending' && !mine;

  const saved = askingPrice && askingPrice > offer.offered_price ? askingPrice - offer.offered_price : null;
  const percent = saved && askingPrice ? Math.round((saved / askingPrice) * 100) : null;

  return (
    <View style={styles.card}>
      <View style={[styles.rail, accepted && styles.railDone, rejected && styles.railOff]} />

      <View style={styles.inner}>
        <View style={styles.head}>
          <View style={styles.headLeft}>
            <Ionicons
              name="pricetags"
              size={14}
              color={accepted ? colors.success : rejected ? colors.textFaint : colors.accent}
            />
            <Text
              style={[
                styles.kicker,
                accepted && styles.kickerDone,
                rejected && styles.kickerOff,
              ]}
            >
              Negotiation offer
            </Text>
          </View>
          <View
            style={[styles.pill, accepted && styles.pillDone, rejected && styles.pillOff]}
          >
            <Text
              style={[
                styles.pillText,
                accepted && styles.pillTextDone,
                rejected && styles.pillTextOff,
              ]}
            >
              {accepted ? 'Agreed' : rejected ? 'Declined' : mine ? 'Sent' : 'Pending action'}
            </Text>
          </View>
        </View>

        <Text style={styles.title}>Price proposal</Text>

        <View style={styles.dealRow}>
          <Text style={styles.dealLabel}>Offered deal</Text>
          {askingPrice != null && saved ? (
            <Text style={styles.was}>₹{askingPrice}</Text>
          ) : null}
          <Text style={[styles.price, rejected && styles.priceOff]}>₹{offer.offered_price}</Text>
          {saved && percent ? (
            <View style={styles.savePill}>
              <Text style={styles.saveText}>
                −₹{saved} ({percent}% off)
              </Text>
            </View>
          ) : null}
        </View>

        {meetingLocation ? (
          <View style={styles.metaRow}>
            <Ionicons name="location" size={13} color={colors.primary} />
            <Text style={styles.metaText}>
              <Text style={styles.metaStrong}>Campus safe zone: </Text>
              {meetingLocation}
            </Text>
          </View>
        ) : null}

        {accepted ? (
          <View style={styles.noteBox}>
            <Ionicons name="checkmark-circle" size={14} color={colors.success} />
            <Text style={styles.noteText}>
              Price locked at ₹{offer.offered_price}. Arrange your meetup below and exchange in
              person at a campus safe zone.
            </Text>
          </View>
        ) : actionable ? (
          <>
            <View style={styles.actions}>
              <Pressable
                onPress={onAccept}
                disabled={busy}
                style={({ pressed }) => [styles.btn, styles.accept, pressed && styles.pressed]}
              >
                <Ionicons name="checkmark-circle-outline" size={16} color={colors.onBrand} />
                <Text style={styles.btnText}>Accept ₹{offer.offered_price}</Text>
              </Pressable>
              <Pressable
                onPress={onCounter}
                disabled={busy}
                style={({ pressed }) => [styles.btn, styles.counter, pressed && styles.pressed]}
              >
                <Ionicons name="repeat" size={16} color={colors.onBrand} />
                <Text style={styles.btnText}>Counter offer</Text>
              </Pressable>
            </View>
            <Pressable onPress={onReject} disabled={busy} style={styles.decline} hitSlop={6}>
              <Text style={styles.declineText}>Decline this offer</Text>
            </Pressable>
          </>
        ) : mine && offer.status === 'pending' ? (
          <Text style={styles.waiting}>Waiting for a reply…</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  rail: { width: 4, backgroundColor: colors.accent },
  railDone: { backgroundColor: colors.success },
  railOff: { backgroundColor: colors.borderStrong },
  inner: { flex: 1, padding: 14, gap: 8 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  kicker: { ...typography.label, color: colors.accent, textTransform: 'uppercase' },
  kickerDone: { color: colors.success },
  kickerOff: { color: colors.textFaint },
  pill: {
    backgroundColor: colors.warningTint,
    borderRadius: radius.chip,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  pillDone: { backgroundColor: colors.successTint },
  pillOff: { backgroundColor: colors.surfaceSunk },
  pillText: { fontSize: 10, fontWeight: '700', color: colors.warning },
  pillTextDone: { color: colors.success },
  pillTextOff: { color: colors.textFaint },
  title: { fontSize: 17, fontWeight: '800', color: colors.text },
  dealRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 },
  dealLabel: { fontSize: 12, color: colors.textMuted },
  was: { fontSize: 14, color: colors.textFaint, textDecorationLine: 'line-through' },
  price: { fontSize: 24, fontWeight: '800', color: colors.text },
  priceOff: { color: colors.textFaint, textDecorationLine: 'line-through' },
  savePill: {
    backgroundColor: colors.successTint,
    borderRadius: radius.chip,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  saveText: { fontSize: 11, fontWeight: '700', color: colors.success },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 12, color: colors.textMuted, flexShrink: 1 },
  metaStrong: { fontWeight: '700', color: colors.text },
  noteBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: colors.successTint,
    borderRadius: 12,
    padding: 10,
  },
  noteText: { flex: 1, fontSize: 12, color: colors.success, lineHeight: 17 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: 12,
  },
  accept: { backgroundColor: colors.primary },
  counter: { backgroundColor: colors.accent },
  pressed: { opacity: 0.88 },
  btnText: { color: colors.onBrand, fontSize: 13, fontWeight: '700' },
  decline: { alignItems: 'center', paddingTop: 8 },
  declineText: { fontSize: 12, color: colors.textMuted },
  waiting: { fontSize: 12, color: colors.textMuted, fontStyle: 'italic' },
});
