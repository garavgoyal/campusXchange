import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { formatDistance } from '../../src/utils/formatDistance';
import { PhotoGallery } from '../../src/components/listings/PhotoGallery';
import { Button } from '../../src/components/ui/Button';
import { ErrorText } from '../../src/components/ui/ErrorText';
import { VerifyNotice, canTrade } from '../../src/components/ui/VerifyNotice';
import { ReportSheet } from '../../src/components/reports/ReportSheet';
import { takedownListing } from '../../src/features/reports/api';
import { startChat } from '../../src/features/chat/api';
import { deleteListing, fetchExchangeMatches, fetchListing } from '../../src/features/listings/api';
import type { Listing } from '../../src/features/listings/types';
import { useProfile } from '../../src/features/profile/hooks';
import { colors, fonts, radius, shadow } from '../../src/constants/colors';
import { Screen } from '../../src/components/ui/Screen';
import { Ionicons } from '@expo/vector-icons';
import { Banner } from '../../src/components/ui/Banner';
import { GlassView } from '../../src/components/ui/Glass';
import { Appear, PressScale, PulseDot } from '../../src/components/ui/motion';

/** The CTA wording differs by type, per the proposal's Section 4.4. */
const CTA: Record<Listing['type'], string> = {
  sell: 'Chat to negotiate',
  lend: 'Request to borrow',
  exchange: 'Propose exchange',
};

function priceLine(listing: Listing): string {
  if (listing.type === 'sell') return listing.price != null ? `₹${listing.price}` : 'Price on request';
  if (listing.type === 'lend') {
    return listing.rent_amount != null
      ? `₹${listing.rent_amount} per ${listing.rent_unit ?? 'day'}`
      : 'Rate on request';
  }
  const tags = listing.want_tags ?? [];
  return tags.length ? `Wants: ${tags.join(', ')}` : 'Open to offers';
}

const TYPE_LABEL: Record<Listing['type'], string> = { sell: 'For sale', lend: 'For rent', exchange: 'Swap' };
const STATUS_LABEL: Partial<Record<Listing['status'], string>> = {
  live: 'Live',
  pending_review: 'In review',
  reserved: 'Reserved',
  completed: 'Sold',
  removed: 'Removed',
};

/** Short price for the bottom bar. */
function ctaPrice(listing: Listing): string {
  if (listing.type === 'sell') return listing.price != null ? `₹${listing.price}` : 'Ask';
  if (listing.type === 'lend') return listing.rent_amount != null ? `₹${listing.rent_amount}/${listing.rent_unit ?? 'day'}` : 'Ask';
  return (listing.want_tags ?? [])[0] ?? 'Offers';
}

function MetaRow({
  icon,
  label,
  value,
  muted,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <View style={styles.metaRow}>
      <View style={styles.metaIcon}>
        <Ionicons name={icon} size={15} color={colors.primary} />
      </View>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={[styles.metaValue, muted && styles.locked]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, profile } = useProfile();

  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [reporting, setReporting] = useState(false);

  // Re-read on focus so coming back from the edit screen shows the new version.
  useFocusEffect(
    useCallback(() => {
      fetchListing(id)
        .then(setListing)
        .catch((e) => setError(e instanceof Error ? e.message : 'Could not load listing'))
        .finally(() => setLoading(false));
    }, [id]),
  );

  async function handleContact() {
    if (!session) {
      router.push('/(auth)/signup');
      return;
    }
    setError(null);
    setStarting(true);
    try {
      const chat = await startChat(id);
      router.push({ pathname: '/chat/[id]', params: { id: chat.id, listingId: id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start the chat');
    } finally {
      setStarting(false);
    }
  }

  function confirmDelete() {
    if (!listing) return;
    Alert.alert(
      'Delete this listing?',
      `"${listing.title}" will be removed from the campus feed.`,
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setRemoving(true);
            try {
              await deleteListing(listing.id);
              router.replace('/(tabs)/history');
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Could not delete that listing');
              setRemoving(false);
            }
          },
        },
      ],
    );
  }

  if (loading) {
    return (
      <Screen style={styles.safe}>
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      </Screen>
    );
  }

  if (!listing) {
    return (
      <Screen style={styles.safe}>
        <View style={styles.content}>
          <ErrorText>{error ?? 'Listing not found'}</ErrorText>
          <Button label="Go back" variant="outline" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  const isOwner = profile?.id === listing.owner_id;
  const isAdmin = profile?.role === 'admin';
  const takenDown = !!listing.taken_down_reason;
  const editable =
    !takenDown && (listing.status === 'live' || listing.status === 'pending_review' || listing.status === 'removed');
  const canReport = !!session && !isOwner && (listing.status === 'live' || listing.status === 'reserved');
  // The chat / borrow / swap button sits in a glass bar at the bottom.
  const showCta = !isOwner && listing.status === 'live' && !(session && !canTrade(profile));

  return (
    <Screen style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <PressScale onPress={() => router.back()} style={styles.circleBtn} accessibilityLabel="Back" hitSlop={8}>
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </PressScale>
        <Text style={styles.topTitle}>Item detail</Text>
        <View style={styles.topStatus}>
          {listing.status === 'live' ? <PulseDot color={colors.primary} size={7} /> : null}
          <Text style={styles.topStatusText}>{STATUS_LABEL[listing.status] ?? listing.status}</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={[styles.content, showCta && styles.contentWithBar]}>
        <Appear>
          <PhotoGallery images={listing.images} />
        </Appear>

        <Appear index={1} style={styles.headBlock}>
          <View style={styles.tagRow}>
            <View style={[styles.tag, styles.tagAccent]}>
              <Text style={[styles.tagText, styles.tagAccentText]}>{TYPE_LABEL[listing.type]}</Text>
            </View>
            <View style={styles.tag}>
              <Text style={styles.tagText}>{listing.category}</Text>
            </View>
            {listing.condition ? (
              <View style={styles.tag}>
                <Ionicons name="sparkles" size={11} color={colors.primary} />
                <Text style={styles.tagText}>{listing.condition}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.title}>{listing.title}</Text>
          <Text style={styles.price}>{priceLine(listing)}</Text>
        </Appear>

        {listing.description ? (
          <Appear index={2} style={styles.noteCard}>
            <Text style={styles.noteLabel}>From the owner</Text>
            <Text style={styles.description}>{listing.description}</Text>
          </Appear>
        ) : null}

        <Appear index={3} style={styles.metaCard}>
          <MetaRow icon="pricetag-outline" label="Category" value={listing.category} />
          {listing.condition ? <MetaRow icon="sparkles-outline" label="Condition" value={listing.condition} /> : null}
          <MetaRow
            icon={listing.location_hidden ? 'lock-closed-outline' : 'location-outline'}
            label="Meeting point"
            value={listing.location_hidden ? 'Sign in to see' : (listing.meeting_location ?? 'Not set')}
            muted={listing.location_hidden}
          />
          {formatDistance(listing.distance_m) ? (
            <MetaRow icon="walk-outline" label="From your hostel" value={formatDistance(listing.distance_m) ?? ''} />
          ) : null}
        </Appear>

        <Appear index={4}>
          <Banner
            icon="shield-checkmark"
            title="Meet at a campus safe spot"
            message="Hand over in a busy, well-lit place. Any payment stays in escrow until a QR scan confirms the handoff."
          />
        </Appear>

        <ErrorText>{error}</ErrorText>

        {isOwner ? (
          <View style={styles.ownerBox}>
            {takenDown ? (
              <View style={styles.takenDown}>
                <Text style={styles.takenDownTitle}>An admin took this listing down</Text>
                <Text style={styles.takenDownBody}>Reason: {listing.taken_down_reason}</Text>
              </View>
            ) : (
              <Text style={styles.ownNotice}>
                {listing.status === 'pending_review'
                  ? 'This is your listing — waiting for admin review.'
                  : 'This is your listing.'}
              </Text>
            )}
            {editable ? (
              <Button
                label="Edit listing"
                onPress={() => router.push({ pathname: '/listing/edit/[id]', params: { id: listing.id } })}
              />
            ) : null}
            <Button
              label="Delete listing"
              variant="outline"
              loading={removing}
              onPress={confirmDelete}
              style={styles.deleteBtn}
            />
          </View>
        ) : listing.status !== 'live' ? (
          <Text style={styles.ownNotice}>This item is reserved in a deal and no longer available.</Text>
        ) : session && !canTrade(profile) ? (
          <VerifyNotice profile={profile} />
        ) : null}
        {isOwner && listing.type === 'exchange' ? <ExchangeMatches listingId={listing.id} /> : null}

        {isAdmin && !isOwner && ['live', 'reserved', 'pending_review'].includes(listing.status) ? (
          <AdminTakedown listingId={listing.id} title={listing.title} onDone={() => router.back()} />
        ) : null}

        {canReport ? (
          <Pressable onPress={() => setReporting(true)} hitSlop={8} style={styles.reportLink} accessibilityRole="button">
            <Text style={styles.reportText}>Report this listing</Text>
          </Pressable>
        ) : null}
      </ScrollView>
      {showCta ? (
        <GlassView intensity={60} style={styles.ctaBar}>
          <View style={styles.ctaPrice}>
            <Text style={styles.ctaPriceLabel}>{listing.type === 'exchange' ? 'Swap' : listing.type === 'lend' ? 'Rent' : 'Price'}</Text>
            <Text style={styles.ctaPriceValue} numberOfLines={1}>
              {ctaPrice(listing)}
            </Text>
          </View>
          <Button
            label={CTA[listing.type]}
            icon="chatbubble-ellipses"
            loading={starting}
            onPress={handleContact}
            style={styles.ctaBtn}
          />
        </GlassView>
      ) : null}
      <ReportSheet
        visible={reporting}
        target={{ listing_id: listing.id }}
        what="this listing"
        onClose={() => setReporting(false)}
      />
    </Screen>
  );
}

/**
 * Admin only: take a live listing off the feed for good, with a reason the
 * owner sees. A deal that hasn't reached the handoff is called off and refunded.
 */
function AdminTakedown({ listingId, title, onDone }: { listingId: string; title: string; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  async function takeDown() {
    if (reason.trim().length < 3) return setError('Write the reason the owner will see');
    setBusy(true);
    setError(null);
    try {
      const r = await takedownListing(listingId, reason.trim());
      setDone(
        `"${title}" was taken down.` +
          (r.cancelled_deals ? ` ${r.cancelled_deals} deal${r.cancelled_deals === 1 ? '' : 's'} called off and refunded.` : '') +
          (r.open_deals ? ` ${r.open_deals} deal${r.open_deals === 1 ? '' : 's'} already past the handoff will finish as normal.` : ''),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not take the listing down');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.adminBox}>
      <Text style={styles.adminTitle}>Admin</Text>
      {done ? (
        <>
          <Text style={styles.adminDone}>{done}</Text>
          <Button label="Back" variant="outline" size="sm" onPress={onDone} />
        </>
      ) : (
        <>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="Reason (the owner sees this)"
            placeholderTextColor={colors.textFaint}
            maxLength={300}
            style={styles.adminInput}
          />
          <ErrorText>{error}</ErrorText>
          <Button label="Take down listing" size="sm" loading={busy} onPress={takeDown} style={styles.danger} />
        </>
      )}
    </View>
  );
}

/**
 * On your own Exchange listing: items other students have listed that fit what
 * you want (matched by your want-tags). Tap one to open it and start a chat.
 */
function ExchangeMatches({ listingId }: { listingId: string }) {
  const [matches, setMatches] = useState<(Listing & { matched_tags: string[] })[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      fetchExchangeMatches(listingId)
        .then(setMatches)
        .catch(() => setMatches([]));
    }, [listingId]),
  );

  if (!matches) return null;
  return (
    <View style={styles.matchCard}>
      <Text style={styles.matchTitle}>On campus that fits what you want</Text>
      {matches.length === 0 ? (
        <Text style={styles.matchEmpty}>Nothing yet. We'll notify you when a matching item is listed.</Text>
      ) : (
        matches.map((m) => (
          <Pressable
            key={m.id}
            onPress={() => router.push({ pathname: '/listing/[id]', params: { id: m.id } })}
            style={({ pressed }) => [styles.matchRow, pressed && styles.pressed]}
          >
            {m.images[0] ? (
              <Image source={{ uri: m.images[0] }} style={styles.matchImg} />
            ) : (
              <View style={[styles.matchImg, styles.matchImgEmpty]} />
            )}
            <View style={styles.flex}>
              <Text style={styles.matchName} numberOfLines={1}>
                {m.title}
              </Text>
              <Text style={styles.matchMeta} numberOfLines={1}>
                Matches “{m.matched_tags.join('”, “')}” · {m.type === 'sell' ? `₹${m.price}` : m.type === 'lend' ? 'to borrow' : 'to swap'}
              </Text>
            </View>
          </Pressable>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pressed: { opacity: 0.7 },
  matchCard: {
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.card,
    padding: 14,
    gap: 10,
  },
  matchTitle: { color: colors.text, fontSize: 15, fontFamily: fonts.bold },
  matchEmpty: { color: colors.textMuted, fontSize: 13, fontFamily: fonts.regular },
  matchRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  matchImg: { width: 44, height: 44, borderRadius: 8, backgroundColor: colors.surfaceSunk },
  matchImgEmpty: { borderWidth: 1, borderColor: colors.border },
  matchName: { color: colors.text, fontSize: 14, fontFamily: fonts.semibold },
  matchMeta: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.regular, marginTop: 1 },
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingTop: 4, paddingBottom: 40, gap: 14 },
  contentWithBar: { paddingBottom: 120 },
  loader: { marginTop: 64 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 8 },
  circleBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glassStrong,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    ...shadow.card,
  },
  topTitle: { flex: 1, color: colors.text, fontSize: 16, fontFamily: fonts.display },
  topStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.glassStrong,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.chip,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  topStatusText: { color: colors.text, fontSize: 11, fontFamily: fonts.bold, letterSpacing: 0.4 },
  headBlock: { gap: 6 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.glassStrong,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.chip,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  tagText: { color: colors.textMuted, fontSize: 11, fontFamily: fonts.bold },
  tagAccent: { backgroundColor: colors.accentTint, borderColor: colors.accentTint },
  tagAccentText: { color: colors.accent },
  title: { color: colors.text, fontSize: 26, fontFamily: fonts.displayBold, letterSpacing: -0.5, lineHeight: 31 },
  price: { color: colors.primary, fontSize: 30, fontFamily: fonts.displayBold, letterSpacing: -0.6 },
  noteCard: {
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.card,
    padding: 14,
    gap: 6,
    ...shadow.card,
  },
  noteLabel: { color: colors.primary, fontSize: 11, fontFamily: fonts.bold, letterSpacing: 0.8, textTransform: 'uppercase' },
  description: { color: colors.text, fontSize: 15, fontFamily: fonts.regular, lineHeight: 22 },
  metaCard: {
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.card,
    padding: 14,
    gap: 12,
    ...shadow.card,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  metaIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaLabel: { flex: 1, color: colors.textMuted, fontSize: 13, fontFamily: fonts.regular },
  ctaBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 16,
    borderRadius: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    paddingLeft: 18,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    ...shadow.float,
  },
  ctaPrice: { flexShrink: 1 },
  ctaPriceLabel: { color: colors.textMuted, fontSize: 11, fontFamily: fonts.semibold },
  ctaPriceValue: { color: colors.text, fontSize: 20, fontFamily: fonts.displayBold, letterSpacing: -0.4 },
  ctaBtn: { flex: 1 },
  metaValue: { color: colors.text, fontSize: 14, fontFamily: fonts.semibold, flexShrink: 1, textAlign: 'right' },
  locked: { color: colors.textMuted, fontStyle: 'italic', fontFamily: fonts.regular },
  ownNotice: { color: colors.textMuted, fontSize: 14, fontFamily: fonts.regular, textAlign: 'center' },
  ownerBox: { gap: 12 },
  deleteBtn: { borderColor: colors.error },
  reportLink: { alignSelf: 'center', paddingVertical: 6 },
  reportText: { color: colors.textMuted, fontSize: 13, fontFamily: fonts.regular, textDecorationLine: 'underline' },
  takenDown: { backgroundColor: colors.errorTint, borderRadius: 12, padding: 12, gap: 4 },
  takenDownTitle: { color: colors.error, fontSize: 14, fontFamily: fonts.bold },
  takenDownBody: { color: colors.text, fontSize: 13, fontFamily: fonts.regular, lineHeight: 18 },
  adminBox: {
    borderWidth: 1,
    borderColor: colors.error,
    backgroundColor: colors.glass,
    borderRadius: radius.card,
    padding: 12,
    gap: 8,
  },
  adminTitle: { color: colors.error, fontSize: 12, fontFamily: fonts.extrabold, letterSpacing: 0.8 },
  adminDone: { color: colors.text, fontSize: 13, fontFamily: fonts.regular, lineHeight: 18 },
  adminInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
    fontSize: 14, fontFamily: fonts.regular,
    color: colors.text,
  },
  danger: { backgroundColor: colors.error, borderColor: colors.error },
});
