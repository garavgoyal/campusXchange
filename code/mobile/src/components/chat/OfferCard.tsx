import React, { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PhotoViewer } from '../listings/PhotoGallery';
import { colors, radius, typography, fonts, shadow } from '../../constants/colors';
import type { Offer } from '../../features/chat/types';
import { PressScale } from '../ui/motion';

type Props = {
  offer: Offer;
  mine: boolean;
  busy: boolean;
  askingPrice?: number | null;
  meetingLocation?: string | null;
  /** Lend offers are a rate, so they read "₹40 / day". */
  rentUnit?: string | null;
  /** Exchange: is the person looking at this the listing owner? (decides "you" vs "they") */
  viewerIsOwner?: boolean;
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
  rentUnit,
  viewerIsOwner,
  onAccept,
  onCounter,
  onReject,
}: Props) {
  const accepted = offer.status === 'accepted';
  const rejected = offer.status === 'rejected';
  const actionable = offer.status === 'pending' && !mine;

  const [viewerAt, setViewerAt] = useState<number | null>(null);

  const swap = !!offer.item_title;
  const images = offer.item_images ?? [];
  const unit = rentUnit ? ` / ${rentUnit}` : '';
  const saved =
    !swap && askingPrice && askingPrice > offer.offered_price ? askingPrice - offer.offered_price : null;
  const percent = saved && askingPrice ? Math.round((saved / askingPrice) * 100) : null;

  // Who adds the top-up, from the viewer's side of the chat.
  const topup = Number(offer.offered_price);
  const viewerPays =
    offer.topup_payer != null && (offer.topup_payer === 'owner') === !!viewerIsOwner;
  const topupLine =
    topup > 0 ? `+ ₹${topup} top-up · ${viewerPays ? 'you add it' : 'they add it'}` : 'Straight swap · no money';

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
              {swap ? 'Exchange offer' : 'Negotiation offer'}
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

        {swap ? (
          <>
            <Text style={styles.title}>Swap proposal</Text>
            {images.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.swapPhotos}>
                {images.map((uri, i) => (
                  <Pressable key={`${uri}-${i}`} onPress={() => setViewerAt(i)} accessibilityLabel={`Photo ${i + 1} of the offered item`}>
                    <Image source={{ uri }} style={[styles.swapPhoto, rejected && styles.faded]} />
                  </Pressable>
                ))}
              </ScrollView>
            ) : null}
            <Text style={[styles.swapItem, rejected && styles.priceOff]}>{offer.item_title}</Text>
            {offer.item_description ? <Text style={styles.swapDesc}>{offer.item_description}</Text> : null}
            <View style={[styles.topupPill, topup > 0 && styles.topupPillMoney]}>
              <Ionicons name={topup > 0 ? 'cash-outline' : 'swap-horizontal'} size={13} color={topup > 0 ? colors.accent : colors.success} />
              <Text style={[styles.topupText, topup > 0 && styles.topupTextMoney]}>{topupLine}</Text>
            </View>
            <PhotoViewer images={images} start={viewerAt ?? 0} visible={viewerAt != null} onClose={() => setViewerAt(null)} />
          </>
        ) : (
          <>
            <Text style={styles.title}>{rentUnit ? 'Rate proposal' : 'Price proposal'}</Text>

            <View style={styles.dealRow}>
              <Text style={styles.dealLabel}>Offered deal</Text>
              {askingPrice != null && saved ? (
                <Text style={styles.was}>₹{askingPrice}</Text>
              ) : null}
              <Text style={[styles.price, rejected && styles.priceOff]}>
                ₹{offer.offered_price}
                {unit ? <Text style={styles.unit}>{unit}</Text> : null}
              </Text>
              {saved && percent ? (
                <View style={styles.savePill}>
                  <Text style={styles.saveText}>
                    −₹{saved} ({percent}% off)
                  </Text>
                </View>
              ) : null}
            </View>
          </>
        )}

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
              {swap
                ? 'Swap agreed. The listing owner confirms it, then you meet at a campus safe zone and swap in person.'
                : `${unit ? 'Rate' : 'Price'} locked at ₹${offer.offered_price}${unit}. Arrange your meetup below and exchange in person at a campus safe zone.`}
            </Text>
          </View>
        ) : actionable ? (
          <>
            <View style={styles.actions}>
              <PressScale
                onPress={onAccept}
                disabled={busy}
                style={({ pressed }) => [styles.btn, styles.accept, pressed && styles.pressed]}
              >
                <Ionicons name="checkmark-circle-outline" size={16} color={colors.onBrand} />
                <Text style={styles.btnText}>
                  {swap ? 'Accept swap' : `Accept ₹${offer.offered_price}${unit}`}
                </Text>
              </PressScale>
              <PressScale
                onPress={onCounter}
                disabled={busy}
                style={({ pressed }) => [styles.btn, styles.counter, pressed && styles.pressed]}
              >
                <Ionicons name="repeat" size={16} color={colors.onBrand} />
                <Text style={styles.btnText}>Counter offer</Text>
              </PressScale>
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
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.card,
    overflow: 'hidden', ...shadow.card,
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
    backgroundColor: colors.accentTint,
    borderRadius: radius.chip,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  pillDone: { backgroundColor: colors.successTint },
  pillOff: { backgroundColor: colors.surfaceSunk },
  pillText: { fontSize: 10, fontFamily: fonts.bold, color: colors.accent, letterSpacing: 0.3 },
  pillTextDone: { color: colors.success },
  pillTextOff: { color: colors.textFaint },
  title: { fontSize: 18, fontFamily: fonts.displayBold, color: colors.text, letterSpacing: -0.2 },
  dealRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 8 },
  dealLabel: { fontSize: 12, fontFamily: fonts.regular, color: colors.textMuted },
  was: { fontSize: 14, fontFamily: fonts.regular, color: colors.textFaint, textDecorationLine: 'line-through' },
  price: { fontSize: 24, fontFamily: fonts.displayBold, color: colors.text },
  priceOff: { color: colors.textFaint, textDecorationLine: 'line-through' },
  unit: { fontSize: 14, fontFamily: fonts.semibold, color: colors.textMuted },
  swapPhotos: { gap: 8 },
  swapPhoto: { width: 92, height: 92, borderRadius: 12, backgroundColor: colors.surfaceSunk },
  faded: { opacity: 0.45 },
  swapItem: { fontSize: 16, fontFamily: fonts.extrabold, color: colors.text },
  swapDesc: { fontSize: 13, fontFamily: fonts.regular, color: colors.textMuted, lineHeight: 18 },
  topupPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    backgroundColor: colors.successTint,
    borderRadius: radius.chip,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  topupPillMoney: { backgroundColor: colors.warningTint },
  topupText: { fontSize: 12, fontFamily: fonts.bold, color: colors.success },
  topupTextMoney: { color: colors.accent },
  savePill: {
    backgroundColor: colors.accent,
    borderRadius: radius.chip,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  saveText: { fontSize: 11, fontFamily: fonts.bold, color: colors.onBrand },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 12, fontFamily: fonts.regular, color: colors.textMuted, flexShrink: 1 },
  metaStrong: { fontFamily: fonts.bold, color: colors.text },
  noteBox: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: 'rgba(229,236,226,0.8)',
    borderRadius: 14,
    padding: 10,
  },
  noteText: { flex: 1, fontSize: 12, fontFamily: fonts.regular, color: colors.success, lineHeight: 17 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 4 },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 46,
    borderRadius: 14,
  },
  accept: {
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  counter: {
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  pressed: { opacity: 0.88 },
  btnText: { color: colors.onBrand, fontSize: 13, fontFamily: fonts.bold },
  decline: { alignItems: 'center', paddingTop: 8 },
  declineText: { fontSize: 12, fontFamily: fonts.regular, color: colors.textMuted },
  waiting: { fontSize: 12, fontFamily: fonts.regular, color: colors.textMuted, fontStyle: 'italic' },
});
