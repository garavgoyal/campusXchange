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
import { SafeAreaView } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { router, useLocalSearchParams } from 'expo-router';
import { OfferCard } from '../../src/components/chat/OfferCard';
import { ErrorText } from '../../src/components/ui/ErrorText';
import {
  acceptOffer,
  fetchThread,
  rejectOffer,
  sendMessage,
  sendOffer,
} from '../../src/features/chat/api';
import type { ThreadEntry } from '../../src/features/chat/types';
import { fetchListing } from '../../src/features/listings/api';
import type { Listing } from '../../src/features/listings/types';
import { useProfile } from '../../src/features/profile/hooks';
import { colors, radius, typography } from '../../src/constants/colors';
import { formatClock, formatDay } from '../../src/utils/formatTime';

const POLL_MS = 4000;

/** Canned openers — they only prefill the box, nothing is sent automatically. */
const QUICK_REPLIES = ['Is it still available?', 'Can we meet today?', 'Is the bill available?'];

export default function ChatThreadScreen() {
  const { id, listingId } = useLocalSearchParams<{ id: string; listingId?: string }>();
  const { session } = useProfile();
  const myId = session?.user.id;

  const [entries, setEntries] = useState<ThreadEntry[]>([]);
  const [listing, setListing] = useState<Listing | null>(null);
  const [draft, setDraft] = useState('');
  const [offerDraft, setOfferDraft] = useState('');
  const [offering, setOffering] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listRef = useRef<FlatList<ThreadEntry>>(null);
  /** Number of sends in flight — polling pauses while > 0 so it can't
   *  overwrite a message that is still being saved. */
  const inFlight = useRef(0);
  const offerInput = useRef<TextInput>(null);

  const load = useCallback(async () => {
    if (inFlight.current > 0) return;
    try {
      const fresh = await fetchThread(id);
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

  useEffect(() => {
    if (listingId) fetchListing(listingId).then(setListing).catch(() => setListing(null));
  }, [listingId]);

  const agreed = useMemo(() => {
    const hit = entries.find((e) => e.kind === 'offer' && e.offer.status === 'accepted');
    return hit?.kind === 'offer' ? hit.offer.offered_price : null;
  }, [entries]);

  const askingPrice = listing?.price ?? listing?.rent_amount ?? null;

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
      await sendOffer(id, price);
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
  async function handleCounter(offerId: string, current: number) {
    setBusy(true);
    try {
      await rejectOffer(offerId);
      await load();
      openOfferBox(current);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not counter that offer');
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Chat</Text>
      </View>

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
          {askingPrice != null ? <Text style={styles.contextPrice}>₹{askingPrice}</Text> : null}
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

      {agreed != null ? (
        <View style={styles.agreedBar}>
          <Ionicons name="checkmark-circle" size={15} color={colors.success} />
          <Text style={styles.agreedText}>Deal agreed at ₹{agreed}</Text>
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
                <View style={styles.entry}>
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
                      onAccept={() => decide(item.offer.id, true)}
                      onCounter={() => handleCounter(item.offer.id, item.offer.offered_price)}
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
                </View>
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

          {!offering && agreed == null ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.quickRow}
              keyboardShouldPersistTaps="handled"
            >
              <Pressable onPress={() => openOfferBox()} style={[styles.quick, styles.quickOffer]}>
                <Ionicons name="pricetag" size={13} color={colors.onBrand} />
                <Text style={styles.quickOfferText}>Make offer</Text>
              </Pressable>
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
                  placeholder="Your price"
                  placeholderTextColor={colors.textFaint}
                  keyboardType="number-pad"
                  style={styles.offerInput}
                />
              </View>
              <Pressable onPress={() => setOffering(false)} hitSlop={8}>
                <Text style={styles.cancel}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleSendOffer}
                disabled={!offerDraft.trim() || busy}
                style={[styles.send, styles.sendAccent, (!offerDraft.trim() || busy) && styles.off]}
              >
                <Ionicons name="pricetag" size={17} color={colors.onBrand} />
              </Pressable>
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
              <Pressable
                onPress={handleSend}
                disabled={!draft.trim() || busy}
                style={[styles.send, (!draft.trim() || busy) && styles.off]}
              >
                <Ionicons name="send" size={17} color={colors.onBrand} />
              </Pressable>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
  headerTitle: { fontSize: 17, fontWeight: '800', color: colors.text },

  contextCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 14,
    marginBottom: 8,
    padding: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
  },
  contextThumb: { width: 42, height: 42, borderRadius: 10, backgroundColor: colors.surfaceSunk },
  contextThumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  contextBody: { flex: 1, gap: 2 },
  contextTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  contextMeta: { flexDirection: 'row', gap: 4 },
  contextMetaText: { fontSize: 11, color: colors.textMuted, flexShrink: 1 },
  contextPrice: { fontSize: 15, fontWeight: '800', color: colors.text },

  safety: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    marginHorizontal: 14,
    marginBottom: 8,
    padding: 10,
    backgroundColor: colors.primaryTint,
    borderRadius: 12,
  },
  safetyText: { flex: 1, fontSize: 11, color: colors.textMuted, lineHeight: 16 },
  safetyStrong: { fontWeight: '700', color: colors.primary },

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
  agreedText: { color: colors.success, fontSize: 13, fontWeight: '700' },

  loader: { marginTop: 40 },
  thread: { paddingHorizontal: 14, paddingBottom: 12 },
  entry: { marginBottom: 10 },
  dayRow: { alignItems: 'center', paddingVertical: 8 },
  dayText: {
    fontSize: 11,
    fontWeight: '600',
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
  mine: { backgroundColor: colors.primary, borderBottomRightRadius: 4 },
  theirs: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: 4,
  },
  bubbleText: { color: colors.text, fontSize: 15, lineHeight: 20 },
  mineText: { color: colors.onBrand },
  stampRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 3, marginLeft: 4 },
  stampRowMine: { marginRight: 4, marginLeft: 0 },
  stamp: { fontSize: 10, color: colors.textFaint },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 40, fontSize: 14 },

  composerWrap: {
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: 8,
  },
  quickRow: { gap: 8, paddingRight: 14 },
  quick: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.chip,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickOffer: { backgroundColor: colors.accent, borderColor: colors.accent },
  quickOfferText: { fontSize: 12, fontWeight: '700', color: colors.onBrand },
  quickText: { fontSize: 12, color: colors.textMuted, fontWeight: '500' },
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
    fontSize: 15,
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
  rupee: { color: colors.textMuted, fontSize: 16, fontWeight: '700' },
  offerInput: { flex: 1, color: colors.text, fontSize: 16, padding: 0 },
  cancel: { color: colors.textMuted, fontSize: 13 },
  send: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendAccent: { backgroundColor: colors.accent },
  off: { opacity: 0.4 },
});
