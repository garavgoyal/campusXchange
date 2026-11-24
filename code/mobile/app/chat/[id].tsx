import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { router, useLocalSearchParams } from 'expo-router';
import { OfferCard } from '../../src/components/chat/OfferCard';
import { MeetingPointPicker } from '../../src/components/campus/MeetingPointPicker';
import { PhotoPicker } from '../../src/components/listings/PhotoPicker';
import { DateField } from '../../src/components/ui/DateField';
import { localIsoDay } from '../../src/utils/dates';
import { DealStatusPill } from '../../src/components/deals/DealStatusPill';
import { Button } from '../../src/components/ui/Button';
import { ErrorText } from '../../src/components/ui/ErrorText';
import { VerifyNotice, canTrade } from '../../src/components/ui/VerifyNotice';
import {
  acceptOffer,
  fetchChats,
  fetchThread,
  rejectOffer,
  sendMessage,
  sendOffer,
} from '../../src/features/chat/api';
import type { Offer, ThreadEntry } from '../../src/features/chat/types';
import { fetchListing, uploadNewPhotos } from '../../src/features/listings/api';
import type { Listing } from '../../src/features/listings/types';
import { useProfile } from '../../src/features/profile/hooks';
import { createDeal, fetchDealForChat } from '../../src/features/transactions/api';
import type { TransactionStatus } from '../../src/features/transactions/types';
import { useRealtimeRefresh } from '../../src/lib/realtime';
import { ReportSheet } from '../../src/components/reports/ReportSheet';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import { PressScale } from '../../src/components/ui/motion';

/** A new message slides in from its own side; a new offer rises into place. */
/** A new message or offer fades in quickly; older ones are just there. */
function arrive(_kind: 'mine' | 'theirs' | 'offer') {
  return FadeIn.duration(160).reduceMotion(ReduceMotion.System);
}
import { colors, radius, fonts, shadow } from '../../src/constants/colors';
import { formatClock, formatDay } from '../../src/utils/formatTime';
import { Screen } from '../../src/components/ui/Screen';
import { markChatSeen } from '../../src/features/chat/unread';

/** Realtime (migration 006) delivers updates instantly; this slow poll is only a safety net. */
const POLL_MS = 15000;


/** Whole days between two YYYY-MM-DD dates (same day = 1), matching the backend. */
function daysBetween(start: string, end: string) {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Number.isFinite(ms) ? Math.max(1, Math.round(ms / 86_400_000)) : 0;
}

type SwapPayer = 'none' | 'me' | 'them';
type SwapForm = { title: string; description: string; photos: string[]; topup: string; payer: SwapPayer };
const EMPTY_SWAP: SwapForm = { title: '', description: '', photos: [], topup: '', payer: 'none' };

/** Canned openers — they only prefill the box, nothing is sent automatically. */
const QUICK_REPLIES = ['Is it still available?', 'Can we meet today?', 'Is the bill available?'];

export default function ChatThreadScreen() {
  const { id, listingId: listingIdParam } = useLocalSearchParams<{ id: string; listingId?: string }>();
  const { session, profile } = useProfile();
  const myId = session?.user.id;
  const [listingId, setListingId] = useState<string | undefined>(listingIdParam);
  const [otherUserId, setOtherUserId] = useState<string | null>(null);
  const [reporting, setReporting] = useState(false);
  const [deal, setDeal] = useState<{ id: string; status: TransactionStatus } | null>(null);
  const [finalising, setFinalising] = useState(false);
  /** Chosen together with the deal; starts as the listing's meeting point. */
  const [meetingPoint, setMeetingPoint] = useState<string | null>(null);
  const [lendForm, setLendForm] = useState({ start: localIsoDay(0), end: localIsoDay(7), deposit: '' });

  const [entries, setEntries] = useState<ThreadEntry[]>([]);
  const [listing, setListing] = useState<Listing | null>(null);
  const [draft, setDraft] = useState('');
  const [offerDraft, setOfferDraft] = useState('');
  const [offering, setOffering] = useState(false);
  /** Exchange composer: 'full' = offer your item (photos + top-up), 'topup' = owner counters the money only. */
  const [swapMode, setSwapMode] = useState<null | 'full' | 'topup'>(null);
  const [swap, setSwap] = useState<SwapForm>(EMPTY_SWAP);
  const [swapNote, setSwapNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listRef = useRef<FlatList<ThreadEntry>>(null);
  // Messages and offers newer than this slide in; the history on screen open doesn't.
  const openedAt = useRef(Date.now() - 2000);
  /** Number of sends in flight — polling pauses while > 0 so it can't
   *  overwrite a message that is still being saved. */
  const inFlight = useRef(0);
  const offerInput = useRef<TextInput>(null);

  const load = useCallback(async () => {
    if (inFlight.current > 0) return;
    try {
      const [fresh, dealRes] = await Promise.all([
        fetchThread(id),
        fetchDealForChat(id).catch(() => ({ transaction: null })),
      ]);
      setDeal(dealRes.transaction as { id: string; status: TransactionStatus } | null);
      // Being in the chat means its new messages are seen: clear its dot and badge.
      markChatSeen(id);
      // Never drop optimistic entries that haven't come back from the server yet.
      setEntries((prev) => {
        const pending = prev.filter((e) => e.kind === 'message' && e.message.id.startsWith('tmp-'));
        return [...fresh, ...pending];
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this conversation');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
    const timer = setInterval(load, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  // Instant updates: a new message or offer row in this chat triggers a re-fetch.
  useRealtimeRefresh(
    [
      { table: 'messages', filter: `chat_id=eq.${id}` },
      { table: 'offers', filter: `chat_id=eq.${id}` },
      { table: 'transactions', filter: `chat_id=eq.${id}` },
    ],
    load,
  );

  // The thread tells us the listing (opened from a notification there is no
  // listingId param) and who the other person is (for "Report").
  useEffect(() => {
    fetchChats()
      .then((threads) => {
        const thread = threads.find((t) => t.id === id);
        if (!thread) return;
        if (!listingId) setListingId(thread.listing_id);
        setOtherUserId(thread.initiator_id === myId ? thread.owner_id : thread.initiator_id);
      })
      .catch(() => undefined);
  }, [id, myId]);

  useEffect(() => {
    if (listingId) fetchListing(listingId).then(setListing).catch(() => setListing(null));
  }, [listingId, deal?.status]);

  const isOwner = !!listing && !!myId && listing.owner_id === myId;
  const isExchange = listing?.type === 'exchange';
  const isLend = listing?.type === 'lend';
  const rentUnit = isLend ? (listing?.rent_unit ?? 'day') : null;
  const itemOffered = entries.some((e) => e.kind === 'offer' && !!e.offer.item_title);

  /** Seller picks this buyer: turns the agreed offer into a deal (transaction). */
  async function handleFinalise() {
    setBusy(true);
    setError(null);
    try {
      if (!meetingPoint) throw new Error('Choose where you will meet');
      const created = await createDeal({
        chat_id: id,
        meeting_location: meetingPoint,
        ...(listing?.type === 'lend'
          ? {
              start_date: lendForm.start,
              end_date: lendForm.end,
              deposit_amount: lendForm.deposit ? Number(lendForm.deposit) : 0,
            }
          : {}),
      });
      setFinalising(false);
      router.push({ pathname: '/deal/[id]', params: { id: created.id } });
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not finalise the deal');
    } finally {
      setBusy(false);
    }
  }

  const agreedOffer = useMemo<Offer | null>(() => {
    const hit = entries.find((e) => e.kind === 'offer' && e.offer.status === 'accepted');
    return hit?.kind === 'offer' ? hit.offer : null;
  }, [entries]);
  const agreed = agreedOffer?.offered_price ?? null;

  const agreedLine = !agreedOffer
    ? ''
    : agreedOffer.item_title
      ? `Swap agreed: ${agreedOffer.item_title}${Number(agreedOffer.offered_price) > 0 ? ` + ₹${agreedOffer.offered_price}` : ''}`
      : rentUnit
        ? `Rate agreed at ₹${agreedOffer.offered_price} / ${rentUnit}`
        : `Price agreed at ₹${agreedOffer.offered_price}`;

  // Lend: preview what the borrower will pay for the dates being entered.
  const lendDays = daysBetween(lendForm.start, lendForm.end);
  const lendUnits = rentUnit === 'week' ? Math.ceil(lendDays / 7) : lendDays;
  const lendTotal = agreed != null && lendDays ? Number(agreed) * lendUnits : null;

  const askingPrice = listing?.price ?? listing?.rent_amount ?? null;

  /** Exchange: open the swap composer, optionally prefilled from an earlier offer. */
  function openSwap(from?: Offer) {
    setSwapNote(null);
    if (isOwner) {
      setSwap({ ...EMPTY_SWAP, topup: from && Number(from.offered_price) > 0 ? String(from.offered_price) : '' });
      setSwapMode('topup');
      return;
    }
    setSwap(
      from?.item_title
        ? {
            title: from.item_title,
            description: from.item_description ?? '',
            photos: from.item_images ?? [],
            topup: Number(from.offered_price) > 0 ? String(from.offered_price) : '',
            payer: !from.topup_payer ? 'none' : from.topup_payer === 'initiator' ? 'me' : 'them',
          }
        : EMPTY_SWAP,
    );
    setSwapMode('full');
  }

  async function handleSendSwap() {
    const topup = swap.topup.trim() ? Number(swap.topup) : 0;
    if (swapMode === 'full') {
      if (swap.title.trim().length < 3) return setSwapNote('Name the item you are offering');
      if (!swap.photos.length) return setSwapNote('Add at least one photo of your item');
    }
    if (topup > 0 && swap.payer === 'none') return setSwapNote('Say who adds the top-up money');

    // "me"/"them" are from the viewer's side; the backend wants initiator/owner.
    const meRole = isOwner ? 'owner' : 'initiator';
    const themRole = isOwner ? 'initiator' : 'owner';
    const payer = topup > 0 ? (swap.payer === 'me' ? meRole : themRole) : undefined;

    setBusy(true);
    setSwapNote(null);
    inFlight.current += 1;
    try {
      let images: string[] | undefined;
      if (swapMode === 'full') {
        setSwapNote('Uploading photos…');
        images = await uploadNewPhotos(swap.photos);
        setSwapNote(null);
      }
      await sendOffer(id, {
        offered_price: topup,
        topup_payer: payer,
        ...(swapMode === 'full'
          ? { item_title: swap.title.trim(), item_description: swap.description.trim() || undefined, item_images: images }
          : {}),
      });
      setSwapMode(null);
      setSwap(EMPTY_SWAP);
      inFlight.current -= 1;
      await load();
    } catch (e) {
      inFlight.current = Math.max(0, inFlight.current - 1);
      setSwapNote(e instanceof Error ? e.message : 'Could not send that offer');
    } finally {
      setBusy(false);
    }
  }

  function openOfferBox(prefill?: number) {
    setOfferDraft(prefill != null ? String(prefill) : '');
    setOffering(true);
    setTimeout(() => offerInput.current?.focus(), 200);
  }

  /**
   * Optimistic send: the bubble appears the instant you tap, then the saved
   * row replaces it. Waiting on the round-trip first is what made this feel slow.
   */
  async function handleSend() {
    const content = draft.trim();
    if (!content) return;

    const tempId = `tmp-${Date.now()}`;
    const at = new Date().toISOString();

    setDraft('');
    setError(null);
    setEntries((prev) => [
      ...prev,
      { kind: 'message', at, message: { id: tempId, chat_id: id, sender_id: myId ?? '', content, sent_at: at } },
    ]);

    inFlight.current += 1;
    try {
      const saved = await sendMessage(id, content);
      setEntries((prev) =>
        prev.map((e) =>
          e.kind === 'message' && e.message.id === tempId
            ? { kind: 'message', at: saved.sent_at, message: saved }
            : e,
        ),
      );
    } catch (e) {
      // Roll the bubble back and hand the text to the user rather than losing it.
      setEntries((prev) =>
        prev.filter((e) => !(e.kind === 'message' && e.message.id === tempId)),
      );
      setDraft(content);
      setError(e instanceof Error ? e.message : 'Could not send');
    } finally {
      inFlight.current -= 1;
    }
  }

  async function handleSendOffer() {
    const price = Number(offerDraft);
    if (!offerDraft.trim() || Number.isNaN(price)) return;
    setBusy(true);
    inFlight.current += 1;
    try {
      await sendOffer(id, { offered_price: price });
      setOfferDraft('');
      setOffering(false);
      inFlight.current -= 1;
      await load();
    } catch (e) {
      inFlight.current = Math.max(0, inFlight.current - 1);
      setError(e instanceof Error ? e.message : 'Could not send that offer');
    } finally {
      setBusy(false);
    }
  }

  async function decide(offerId: string, accept: boolean) {
    setBusy(true);
    try {
      await (accept ? acceptOffer(offerId) : rejectOffer(offerId));
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that decision');
    } finally {
      setBusy(false);
    }
  }

  /** Counter = decline theirs, then immediately propose your own. */
  async function handleCounter(offer: Offer) {
    setBusy(true);
    try {
      await rejectOffer(offer.id);
      await load();
      if (isExchange) openSwap(offer);
      else openOfferBox(offer.offered_price);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not counter that offer');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen style={styles.safe} edges={['top']}>
      {/* header */}
      <View style={styles.header}>
        <PressScale onPress={() => router.back()} hitSlop={10} style={styles.backBtn} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </PressScale>
        <Text style={[styles.headerTitle, styles.flex]}>Chat</Text>
        {otherUserId ? (
          <Pressable
            onPress={() => setReporting(true)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Report this student"
            style={styles.reportBtn}
          >
            <Ionicons name="flag-outline" size={16} color={colors.textMuted} />
            <Text style={styles.reportText}>Report</Text>
          </Pressable>
        ) : null}
      </View>
      <ReportSheet
        visible={reporting}
        target={otherUserId ? { user_id: otherUserId } : null}
        what="this student"
        onClose={() => setReporting(false)}
      />

      {/* listing context */}
      {listing ? (
        <Pressable
          style={styles.contextCard}
          onPress={() => router.push(`/listing/${listing.id}`)}
        >
          {listing.images[0] ? (
            <Image source={{ uri: listing.images[0] }} style={styles.contextThumb} />
          ) : (
            <View style={[styles.contextThumb, styles.contextThumbEmpty]}>
              <Ionicons name="image-outline" size={16} color={colors.textFaint} />
            </View>
          )}
          <View style={styles.contextBody}>
            <Text style={styles.contextTitle} numberOfLines={1}>
              {listing.title}
            </Text>
            <View style={styles.contextMeta}>
              {listing.condition ? (
                <Text style={styles.contextMetaText}>{listing.condition}</Text>
              ) : null}
              {listing.meeting_location ? (
                <Text style={styles.contextMetaText} numberOfLines={1}>
                  · {listing.meeting_location}
                </Text>
              ) : null}
            </View>
          </View>
          {askingPrice != null ? (
            <Text style={styles.contextPrice}>
              ₹{askingPrice}
              {rentUnit ? <Text style={styles.contextUnit}>/{rentUnit}</Text> : null}
            </Text>
          ) : null}
          <Ionicons name="chevron-forward" size={17} color={colors.textFaint} />
        </Pressable>
      ) : null}

      {/* safety */}
      <View style={styles.safety}>
        <Ionicons name="shield-checkmark" size={14} color={colors.primary} />
        <Text style={styles.safetyText}>
          <Text style={styles.safetyStrong}>Safety note: </Text>
          Always meet at a verified campus safe zone — Library foyer, academic block gates or
          hostel reception.
        </Text>
      </View>

      {deal ? (
        <Pressable
          style={styles.agreedBar}
          onPress={() => router.push({ pathname: '/deal/[id]', params: { id: deal.id } })}
        >
          <Ionicons name="bag-check" size={15} color={colors.success} />
          <Text style={[styles.agreedText, styles.flex]}>View deal</Text>
          <DealStatusPill status={deal.status} />
          <Ionicons name="chevron-forward" size={16} color={colors.success} />
        </Pressable>
      ) : agreed != null ? (
        <View style={styles.agreedWrap}>
          <View style={styles.agreedBar}>
            <Ionicons name="checkmark-circle" size={15} color={colors.success} />
            <Text style={[styles.agreedText, styles.flex]}>{agreedLine}</Text>
            {isOwner && listing?.status === 'live' && !finalising ? (
              <Button
                label={isExchange ? 'Confirm swap' : 'Finalise deal'}
                size="sm"
                loading={busy}
                onPress={() => {
                  setMeetingPoint(listing.meeting_location ?? null);
                  setFinalising(true);
                }}
              />
            ) : null}
          </View>
          {!isOwner && listing?.status === 'live' ? (
            <Text style={styles.agreedHint}>
              {isExchange
                ? 'Waiting for the owner to confirm the swap with you.'
                : 'Waiting for the seller to finalise the deal with you.'}
            </Text>
          ) : null}
          {finalising ? (
            <View style={styles.lendForm}>
              <Text style={styles.lendTitle}>Where will you meet?</Text>
              <MeetingPointPicker value={meetingPoint} onChange={setMeetingPoint} />
              <Text style={styles.lendHint}>
                {meetingPoint && meetingPoint === listing?.meeting_location
                  ? 'The meeting point from your listing. Change it if you agreed somewhere else in the chat.'
                  : "They see this before paying and can cancel if it doesn't suit them."}
              </Text>
              {isLend ? <Text style={styles.lendTitle}>Lend terms</Text> : null}
              {isLend ? (
              <View style={styles.lendRow}>
                <DateField
                  label="From"
                  value={lendForm.start}
                  minimumDate={localIsoDay(0)}
                  onChange={(start) =>
                    // Keep the return date on or after the new start date.
                    setLendForm((f) => ({ ...f, start, end: f.end < start ? start : f.end }))
                  }
                />
                <DateField
                  label="Return by"
                  value={lendForm.end}
                  minimumDate={lendForm.start}
                  onChange={(end) => setLendForm((f) => ({ ...f, end }))}
                />
                <View style={styles.flex}>
                  <Text style={styles.lendLabel}>Deposit ₹</Text>
                  <TextInput
                    value={lendForm.deposit}
                    onChangeText={(t) => setLendForm((f) => ({ ...f, deposit: t.replace(/[^0-9]/g, '') }))}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor={colors.textFaint}
                    style={styles.lendInput}
                  />
                </View>
              </View>
              ) : null}
              {!isLend ? null : lendTotal != null ? (
                <Text style={styles.lendSum}>
                  {lendUnits} {rentUnit}
                  {lendUnits === 1 ? '' : 's'} × ₹{agreed} = ₹{lendTotal} rent
                  {Number(lendForm.deposit) > 0 ? ` + ₹${lendForm.deposit} refundable deposit` : ''}
                </Text>
              ) : (
                <Text style={styles.lendSum}>Pick the borrowing dates.</Text>
              )}
              <View style={styles.lendRow}>
                <Button label="Back" variant="outline" size="sm" onPress={() => setFinalising(false)} style={styles.flex} />
                <Button
                  label={isExchange ? 'Confirm swap' : 'Confirm deal'}
                  size="sm"
                  loading={busy}
                  disabled={!meetingPoint}
                  onPress={handleFinalise}
                  style={styles.flex}
                />
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      <KeyboardAvoidingView style={styles.flex} behavior="padding">
        {loading ? (
          <ActivityIndicator color={colors.primary} style={styles.loader} />
        ) : (
          <FlatList
            ref={listRef}
            data={entries}
            keyExtractor={(item) =>
              item.kind === 'message' ? `m${item.message.id}` : `o${item.offer.id}`
            }
            contentContainerStyle={styles.thread}
            onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item, index }) => {
              const prev = entries[index - 1];
              const showDay = !prev || formatDay(prev.at) !== formatDay(item.at);

              return (
                <Animated.View
                  style={styles.entry}
                  entering={Date.parse(item.at) > openedAt.current ? arrive(item.kind === 'offer' ? 'offer' : item.message.sender_id === myId ? 'mine' : 'theirs') : undefined}
                >
                  {showDay ? (
                    <View style={styles.dayRow}>
                      <Text style={styles.dayText}>{formatDay(item.at)}</Text>
                    </View>
                  ) : null}

                  {item.kind === 'offer' ? (
                    <OfferCard
                      offer={item.offer}
                      mine={item.offer.sender_id === myId}
                      busy={busy}
                      askingPrice={askingPrice}
                      meetingLocation={listing?.meeting_location}
                      rentUnit={rentUnit}
                      viewerIsOwner={isOwner}
                      onAccept={() => decide(item.offer.id, true)}
                      onCounter={() => handleCounter(item.offer)}
                      onReject={() => decide(item.offer.id, false)}
                    />
                  ) : (
                    (() => {
                      const mine = item.message.sender_id === myId;
                      return (
                        <View style={mine ? styles.rowMine : styles.rowTheirs}>
                          <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                            <Text style={[styles.bubbleText, mine && styles.mineText]}>
                              {item.message.content}
                            </Text>
                          </View>
                          <View style={[styles.stampRow, mine && styles.stampRowMine]}>
                            <Text style={styles.stamp}>{formatClock(item.message.sent_at)}</Text>
                            {mine ? (
                              <Ionicons
                                name={
                                  item.message.id.startsWith('tmp-')
                                    ? 'time-outline'
                                    : 'checkmark-done'
                                }
                                size={12}
                                color={colors.textFaint}
                              />
                            ) : null}
                          </View>
                        </View>
                      );
                    })()
                  )}
                </Animated.View>
              );
            }}
            ListEmptyComponent={
              <Text style={styles.empty}>No messages yet — say hello.</Text>
            }
          />
        )}

        {/* composer */}
        <View style={styles.composerWrap}>
          <ErrorText>{error}</ErrorText>
          {profile && !canTrade(profile) ? <VerifyNotice profile={profile} /> : null}

          {isExchange && isOwner && !itemOffered && agreed == null ? (
            <Text style={styles.swapWait}>
              Waiting for them to offer an item. You can accept, decline or counter the top-up once they do.
            </Text>
          ) : null}

          {swapMode ? (
            <View style={styles.swapBox}>
              <Text style={styles.lendTitle}>
                {swapMode === 'full' ? 'Offer your item in exchange' : 'Counter with a different top-up'}
              </Text>
              {swapMode === 'full' ? (
                <>
                  <PhotoPicker
                    uris={swap.photos}
                    onChange={(photos) => setSwap((f) => ({ ...f, photos }))}
                    disabled={busy}
                  />
                  <TextInput
                    value={swap.title}
                    onChangeText={(t) => setSwap((f) => ({ ...f, title: t }))}
                    placeholder="What are you offering? e.g. Boat Rockerz headphones"
                    placeholderTextColor={colors.textFaint}
                    style={styles.swapInput}
                    maxLength={120}
                  />
                  <TextInput
                    value={swap.description}
                    onChangeText={(t) => setSwap((f) => ({ ...f, description: t }))}
                    placeholder="Condition, age, anything included (optional)"
                    placeholderTextColor={colors.textFaint}
                    style={[styles.swapInput, styles.swapMulti]}
                    multiline
                    maxLength={1000}
                  />
                </>
              ) : null}
              <Text style={styles.lendLabel}>Top-up money (if the items aren't worth the same)</Text>
              <View style={styles.payerRow}>
                {([
                  ['none', 'Even swap'],
                  ['me', 'I add money'],
                  ['them', 'They add money'],
                ] as const).map(([key, label]) => (
                  <Pressable
                    key={key}
                    onPress={() => setSwap((f) => ({ ...f, payer: key, topup: key === 'none' ? '' : f.topup }))}
                    style={[styles.payerChip, swap.payer === key && styles.payerChipOn]}
                  >
                    <Text style={[styles.payerText, swap.payer === key && styles.payerTextOn]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
              {swap.payer !== 'none' ? (
                <View style={[styles.offerField, styles.topupField]}>
                  <Text style={styles.rupee}>₹</Text>
                  <TextInput
                    value={swap.topup}
                    onChangeText={(t) => setSwap((f) => ({ ...f, topup: t.replace(/[^0-9]/g, '') }))}
                    placeholder="Top-up amount"
                    placeholderTextColor={colors.textFaint}
                    keyboardType="number-pad"
                    style={styles.offerInput}
                  />
                </View>
              ) : null}
              {swapNote ? <Text style={styles.swapNote}>{swapNote}</Text> : null}
              <View style={styles.lendRow}>
                <Button label="Cancel" variant="outline" size="sm" onPress={() => setSwapMode(null)} style={styles.flex} />
                <Button
                  label={swapMode === 'full' ? 'Send swap offer' : 'Send counter'}
                  size="sm"
                  loading={busy}
                  onPress={handleSendSwap}
                  style={styles.flex}
                />
              </View>
            </View>
          ) : null}

          {!offering && !swapMode && agreed == null ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickRow}
              keyboardShouldPersistTaps="handled"
            >
              {isExchange ? (
                !isOwner ? (
                  <Pressable onPress={() => openSwap()} style={[styles.quick, styles.quickOffer]}>
                    <Ionicons name="swap-horizontal" size={13} color={colors.onBrand} />
                    <Text style={styles.quickOfferText}>Offer an item</Text>
                  </Pressable>
                ) : null
              ) : (
                <Pressable onPress={() => openOfferBox()} style={[styles.quick, styles.quickOffer]}>
                  <Ionicons name="pricetag" size={13} color={colors.onBrand} />
                  <Text style={styles.quickOfferText}>{isLend ? 'Offer a rate' : 'Make offer'}</Text>
                </Pressable>
              )}
              {QUICK_REPLIES.map((q) => (
                <Pressable key={q} onPress={() => setDraft(q)} style={styles.quick}>
                  <Text style={styles.quickText}>{q}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}

          {offering ? (
            <View style={styles.row}>
              <View style={styles.offerField}>
                <Text style={styles.rupee}>₹</Text>
                <TextInput
                  ref={offerInput}
                  value={offerDraft}
                  onChangeText={(t) => setOfferDraft(t.replace(/[^0-9]/g, ''))}
                  placeholder={rentUnit ? `Your rate per ${rentUnit}` : 'Your price'}
                  placeholderTextColor={colors.textFaint}
                  keyboardType="number-pad"
                  style={styles.offerInput}
                />
              </View>
              <Pressable onPress={() => setOffering(false)} hitSlop={8}>
                <Text style={styles.cancel}>Cancel</Text>
              </Pressable>
              <PressScale
                scaleTo={0.94}
                onPress={handleSendOffer}
                disabled={!offerDraft.trim() || busy}
                accessibilityLabel="Send offer"
                style={[styles.send, styles.sendAccent, (!offerDraft.trim() || busy) && styles.off]}
              >
                <Ionicons name="pricetag" size={17} color={colors.onBrand} />
              </PressScale>
            </View>
          ) : (
            <View style={styles.row}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="Message"
                placeholderTextColor={colors.textFaint}
                style={styles.input}
                multiline
                maxLength={2000}
              />
              <PressScale
                scaleTo={0.94}
                onPress={handleSend}
                disabled={!draft.trim() || busy}
                accessibilityLabel="Send"
                style={[styles.send, (!draft.trim() || busy) && styles.off]}
              >
                <Ionicons name="send" size={17} color={colors.onBrand} />
              </PressScale>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 10,
  },
  headerTitle: { fontSize: 18, fontFamily: fonts.displayBold, color: colors.text },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glassStrong,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    ...shadow.card,
  },
  reportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.glassStrong,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.chip,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  reportText: { fontSize: 13, color: colors.textMuted, fontFamily: fonts.semibold },

  contextCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 14,
    marginBottom: 8,
    padding: 10,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.card, ...shadow.card,
  },
  contextThumb: { width: 42, height: 42, borderRadius: 10, backgroundColor: colors.surfaceSunk },
  contextThumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  contextBody: { flex: 1, gap: 2 },
  contextTitle: { fontSize: 14, fontFamily: fonts.bold, color: colors.text },
  contextMeta: { flexDirection: 'row', gap: 4 },
  contextMetaText: { fontSize: 11, fontFamily: fonts.regular, color: colors.textMuted, flexShrink: 1 },
  contextPrice: { fontSize: 17, fontFamily: fonts.displayBold, color: colors.text },
  contextUnit: { fontSize: 11, fontFamily: fonts.semibold, color: colors.textMuted },

  safety: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    marginHorizontal: 14,
    marginBottom: 8,
    padding: 10,
    backgroundColor: 'rgba(229,236,226,0.75)',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: 14,
  },
  safetyText: { flex: 1, fontSize: 11, fontFamily: fonts.regular, color: colors.textMuted, lineHeight: 16 },
  safetyStrong: { fontFamily: fonts.bold, color: colors.primary },

  agreedBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginHorizontal: 14,
    marginBottom: 8,
    paddingVertical: 9,
    paddingHorizontal: 12,
    backgroundColor: colors.successTint,
    borderRadius: 12,
  },
  agreedText: { color: colors.success, fontSize: 13, fontFamily: fonts.bold },
  agreedWrap: { marginBottom: 8 },
  agreedHint: { marginHorizontal: 14, marginTop: -4, fontSize: 11, fontFamily: fonts.regular, color: colors.textMuted },
  lendForm: {
    marginHorizontal: 14,
    padding: 12,
    gap: 10,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: 12, ...shadow.card,
  },
  lendTitle: { fontSize: 13, fontFamily: fonts.bold, color: colors.text },
  lendSum: { fontSize: 12, color: colors.text, fontFamily: fonts.semibold },
  lendHint: { fontSize: 11, fontFamily: fonts.regular, color: colors.textMuted },
  swapWait: { fontSize: 12, fontFamily: fonts.regular, color: colors.textMuted, textAlign: 'center' },
  swapBox: {
    gap: 10,
    padding: 12,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 14,
  },
  swapInput: {
    minHeight: 42,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14, fontFamily: fonts.regular,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  swapMulti: { minHeight: 64, textAlignVertical: 'top' },
  swapNote: { fontSize: 12, fontFamily: fonts.regular, color: colors.error },
  topupField: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto' },
  payerRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  payerChip: {
    paddingHorizontal: 11,
    paddingVertical: 7,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  payerChipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  payerText: { fontSize: 12, fontFamily: fonts.semibold, color: colors.textMuted },
  payerTextOn: { color: colors.onBrand },
  lendRow: { flexDirection: 'row', gap: 8 },
  lendLabel: { fontSize: 10, fontFamily: fonts.regular, color: colors.textMuted, marginBottom: 4 },
  lendInput: {
    height: 38,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 8,
    fontSize: 13, fontFamily: fonts.regular,
    color: colors.text,
    backgroundColor: colors.background,
  },

  loader: { marginTop: 40 },
  thread: { paddingHorizontal: 14, paddingBottom: 12 },
  entry: { marginBottom: 10 },
  dayRow: { alignItems: 'center', paddingVertical: 8 },
  dayText: {
    fontSize: 11,
    fontFamily: fonts.semibold,
    color: colors.textFaint,
    backgroundColor: colors.surfaceSunk,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.chip,
    overflow: 'hidden',
  },
  rowMine: { alignItems: 'flex-end' },
  rowTheirs: { alignItems: 'flex-start' },
  bubble: { maxWidth: '84%', borderRadius: radius.card, paddingHorizontal: 13, paddingVertical: 10 },
  mine: {
    backgroundColor: colors.primary,
    borderBottomRightRadius: 6,
    shadowColor: colors.primary,
    shadowOpacity: 0.22,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  theirs: {
    backgroundColor: colors.glassStrong,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderBottomLeftRadius: 6,
    ...shadow.card,
  },
  bubbleText: { color: colors.text, fontSize: 15, fontFamily: fonts.regular, lineHeight: 20 },
  mineText: { color: colors.onBrand },
  stampRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3, marginLeft: 4 },
  stampRowMine: { marginRight: 4, marginLeft: 0 },
  stamp: { fontSize: 10, fontFamily: fonts.regular, color: colors.textFaint },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 40, fontSize: 14, fontFamily: fonts.regular },

  composerWrap: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: colors.glassStrong,
    borderTopWidth: 1,
    borderTopColor: colors.glassBorder,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    gap: 8,
    ...shadow.float,
  },
  quickRow: { gap: 8, paddingRight: 14 },
  quick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.chip,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickOffer: { backgroundColor: colors.accent, borderColor: colors.accent },
  quickOfferText: { fontSize: 12, fontFamily: fonts.bold, color: colors.onBrand },
  quickText: { fontSize: 12, color: colors.textMuted, fontFamily: fonts.medium },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 21,
    paddingHorizontal: 15,
    paddingVertical: 11,
    color: colors.text,
    fontSize: 15, fontFamily: fonts.regular,
    maxHeight: 110,
  },
  offerField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 21,
    paddingHorizontal: 15,
    height: 44,
  },
  rupee: { color: colors.textMuted, fontSize: 16, fontFamily: fonts.bold },
  offerInput: { flex: 1, color: colors.text, fontSize: 16, fontFamily: fonts.regular, padding: 0 },
  cancel: { color: colors.textMuted, fontSize: 13, fontFamily: fonts.regular },
  send: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  sendAccent: { backgroundColor: colors.accent },
  off: { opacity: 0.4 },
});
