import React, { useCallback, useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { ConditionPhotos } from '../../src/components/deals/ConditionPhotos';
import { PhotoGallery } from '../../src/components/listings/PhotoGallery';
import { DealStatusPill } from '../../src/components/deals/DealStatusPill';
import { Banner } from '../../src/components/ui/Banner';
import { Button } from '../../src/components/ui/Button';
import { ErrorText } from '../../src/components/ui/ErrorText';
import { colors, radius, typography, fonts, shadow } from '../../src/constants/colors';
import { useRealtimeRefresh } from '../../src/lib/realtime';
import {
  cancelDeal,
  fetchDeal,
  issueQr,
  payDeal,
  raiseDispute,
} from '../../src/features/transactions/api';
import type { Deal, QrTicket } from '../../src/features/transactions/types';
import { BackButton } from '../../src/components/ui/BackButton';
import { StepTracker } from '../../src/components/deals/StepTracker';
import { Screen } from '../../src/components/ui/Screen';

const FALLBACK_POLL_MS = 15000;

function rupees(n: number | null | undefined) {
  return `₹${Number(n ?? 0).toLocaleString('en-IN')}`;
}

/** Plain-English "what do I do now?" for the viewer. */
function nextStep(deal: Deal): string {
  const buyer = deal.my_role === 'buyer';
  const lend = deal.type === 'lend';
  if (deal.type === 'exchange') {
    const topup = Number(deal.agreed_price);
    switch (deal.status) {
      case 'pending_payment':
        return deal.i_pay
          ? `Pay the ₹${topup} top-up into escrow. It is released only after the swap is confirmed.`
          : `Waiting for the other side to pay the ₹${topup} top-up into escrow.`;
      case 'escrow_held':
      case 'qr_issued':
        return deal.i_show_qr
          ? 'Meet at the campus point and swap items. After they check yours, show your QR for them to scan.'
          : 'Meet at the campus point and swap items. Check theirs, photograph it, then scan their QR to confirm.';
      case 'completed':
        return topup > 0 ? 'Swap done. The top-up was released.' : 'Swap done.';
      case 'refunded':
        return 'This swap was called off and the top-up refunded.';
      case 'cancelled':
        return 'This swap was cancelled.';
      case 'disputed':
        return 'An admin is reviewing this swap. Any top-up stays frozen. Add photos that support your side.';
    }
  }
  switch (deal.status) {
    case 'pending_payment':
      return buyer
        ? 'Pay into escrow. The seller only receives it after you confirm the handoff.'
        : 'Waiting for the buyer to pay into escrow.';
    case 'escrow_held':
    case 'qr_issued':
      return buyer
        ? 'Meet at the campus point. Inspect the item, photograph it, then scan the seller’s QR to release payment.'
        : 'Meet at the campus point and show your QR. The buyer scans it after checking the item.';
    case 'in_use':
      return buyer
        ? 'Return the item by the due date and show your return QR to the lender.'
        : 'When the item comes back, inspect it, photograph it and scan the borrower’s return QR.';
    case 'disputed':
      return 'An admin is reviewing this deal. Escrow is frozen. Add any photos that support your side.';
    case 'completed':
      return lend
        ? 'Returned. Rent was released to the lender and the deposit refunded.'
        : 'Handoff confirmed. Payment was released to the seller.';
    case 'refunded':
      return 'This deal was called off and the escrow refunded to the buyer.';
    case 'cancelled':
      return 'This deal was cancelled before any payment.';
  }
}

export default function DealScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qr, setQr] = useState<QrTicket | null>(null);
  const [now, setNow] = useState(Date.now());
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    try {
      const fresh = await fetchDeal(id);
      setDeal(fresh);
      setError(null);
      // The QR is single-use: once the deal moves on, stop showing it.
      if (!fresh.i_show_qr) setQr(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load this deal');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
      const timer = setInterval(load, FALLBACK_POLL_MS);
      return () => clearInterval(timer);
    }, [load]),
  );

  // Instant updates when the other party pays, scans, cancels, etc.
  useRealtimeRefresh([{ table: 'transactions', filter: `id=eq.${id}` }], load);

  // Countdown for the QR expiry.
  useEffect(() => {
    if (!qr) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [qr]);

  async function run(label: string, action: () => Promise<unknown>) {
    setBusy(label);
    setError(null);
    try {
      await action();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(null);
    }
  }

  function confirmPay() {
    if (!deal) return;
    const total = Number(deal.agreed_price) + Number(deal.lend?.deposit_amount ?? 0);
    Alert.alert(
      `Pay ${rupees(total)} into escrow?`,
      deal.type === 'exchange'
        ? 'Simulated payment for the pilot — no real money moves. The top-up is held until the swap is confirmed.'
        : 'Simulated payment for the pilot — no real money moves. It is held until you confirm the handoff.',
      [
        { text: 'Not yet', style: 'cancel' },
        { text: 'Pay', onPress: () => run('pay', () => payDeal(deal.id)) },
      ],
    );
  }

  function confirmCancel() {
    if (!deal) return;
    Alert.alert(
      'Cancel this deal?',
      deal.escrow?.status === 'held' && Number(deal.escrow.amount) > 0
        ? 'The escrow will be refunded to whoever paid it and the item goes back on the feed.'
        : 'The item goes back on the feed.',
      [
        { text: 'Keep deal', style: 'cancel' },
        { text: 'Cancel deal', style: 'destructive', onPress: () => run('cancel', () => cancelDeal(deal.id)) },
      ],
    );
  }

  async function showQr() {
    setBusy('qr');
    setError(null);
    try {
      setQr(await issueQr(id));
      setNow(Date.now());
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create a QR code');
    } finally {
      setBusy(null);
    }
  }

  async function submitDispute() {
    const text = reason.trim();
    if (text.length < 10) {
      setError('Describe the problem in at least 10 characters');
      return;
    }
    await run('dispute', () => raiseDispute(id, text));
    setReporting(false);
    setReason('');
  }

  if (loading) {
    return (
      <Screen style={styles.safe}>
        <ActivityIndicator color={colors.primary} style={styles.loader} />
      </Screen>
    );
  }

  if (!deal) {
    return (
      <Screen style={styles.safe}>
        <View style={styles.content}>
          <ErrorText>{error ?? 'Deal not found'}</ErrorText>
          <Button label="Go back" variant="outline" onPress={() => router.back()} />
        </View>
      </Screen>
    );
  }

  const buyer = deal.my_role === 'buyer';
  const lend = deal.type === 'lend';
  const exchange = deal.type === 'exchange';
  const payerName = deal.payer_id === deal.seller_id ? deal.seller_name : deal.buyer_name;
  const counterparty = buyer ? deal.seller_name : deal.buyer_name;
  const roleLine = lend
    ? buyer ? `Borrowing from ${counterparty}` : `Lending to ${counterparty}`
    : deal.type === 'exchange'
      ? `Exchanging with ${counterparty}`
      : buyer ? `Buying from ${counterparty}` : `Selling to ${counterparty}`;

  const deposit = Number(deal.lend?.deposit_amount ?? 0);
  const total = Number(deal.agreed_price) + deposit;
  const cancellable = ['pending_payment', 'escrow_held', 'qr_issued'].includes(deal.status);
  const disputable = ['escrow_held', 'qr_issued', 'in_use'].includes(deal.status);
  const disputed = deal.status === 'disputed';
  const secondsLeft = qr ? Math.max(0, Math.round((new Date(qr.expires_at).getTime() - now) / 1000)) : 0;

  const steps = lend
    ? ['Agreed', 'Paid', 'Handed over', 'Returned']
    : exchange
      ? ['Agreed', Number(deal.agreed_price) > 0 ? 'Top-up paid' : 'Confirmed', 'Swapped']
      : ['Agreed', 'Paid', 'Handed over'];
  const reached =
    deal.status === 'pending_payment' ? 0
    : deal.status === 'escrow_held' || deal.status === 'qr_issued' ? 1
    : deal.status === 'in_use' ? 2
    : deal.status === 'completed' ? steps.length - 1
    : -1;

  return (
    <Screen style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <BackButton />
        <Text style={styles.headerTitle}>Deal</Text>
      </View>

      <KeyboardAwareScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        bottomOffset={20}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colors.primary} />}
      >
        {/* item + counterparty */}
        <View style={styles.card}>
          <View style={styles.itemRow}>
            {deal.listing?.images?.[0] ? (
              <Image source={{ uri: deal.listing.images[0] }} style={styles.thumb} />
            ) : (
              <View style={[styles.thumb, styles.thumbEmpty]}>
                <Ionicons name="image-outline" size={18} color={colors.textFaint} />
              </View>
            )}
            <View style={styles.itemBody}>
              <Text style={styles.itemTitle} numberOfLines={2}>
                {deal.listing?.title ?? 'Item'}
              </Text>
              <Text style={styles.meta}>{roleLine}</Text>
              <DealStatusPill status={deal.status} />
            </View>
          </View>

          {reached >= 0 ? <StepTracker steps={steps} reached={reached} /> : null}

          <Text style={styles.next}>{nextStep(deal)}</Text>
        </View>

        {/* exchange: the item coming the other way */}
        {deal.exchange_item ? (
          <View style={styles.card}>
            <Text style={styles.label}>{buyer ? 'YOUR ITEM IN THE SWAP' : 'WHAT YOU GET IN EXCHANGE'}</Text>
            <PhotoGallery images={deal.exchange_item.images} height={200} />
            <Text style={styles.itemTitle}>{deal.exchange_item.title}</Text>
            {deal.exchange_item.description ? <Text style={styles.body}>{deal.exchange_item.description}</Text> : null}
          </View>
        ) : null}

        {/* money */}
        <View style={styles.card}>
          <Text style={styles.label}>PAYMENT</Text>
          {exchange ? (
            <>
              <Row
                label="Top-up"
                value={Number(deal.agreed_price) > 0 ? rupees(deal.agreed_price) : 'None · straight swap'}
              />
              {Number(deal.agreed_price) > 0 ? <Row label="Paid by" value={deal.i_pay ? 'You' : payerName} /> : null}
            </>
          ) : (
            <Row label={lend ? 'Rent (total)' : 'Agreed price'} value={rupees(deal.agreed_price)} />
          )}
          {lend && deal.lend_rate ? (
            <Row label="Agreed rate" value={`${rupees(deal.lend_rate.amount)} / ${deal.lend_rate.unit}`} />
          ) : null}
          {lend ? <Row label="Refundable deposit" value={rupees(deposit)} /> : null}
          {lend ? <Row label="Total held in escrow" value={rupees(total)} strong /> : null}
          {deal.escrow ? (
            <>
              <Row
                label="Escrow"
                value={
                  deal.escrow.status === 'held'
                    ? `Held · ${rupees(deal.escrow.amount)}`
                    : deal.escrow.status === 'released'
                      ? 'Released'
                      : 'Refunded'
                }
              />
              {deal.escrow.status !== 'held' && Number(deal.escrow.amount) > 0 ? (
                <>
                  <Row label={`To ${buyer ? deal.seller_name : 'you'}`} value={rupees(deal.escrow.released_to_seller)} />
                  <Row label={`To ${buyer ? 'you' : deal.buyer_name}`} value={rupees(deal.escrow.refunded_to_buyer)} />
                </>
              ) : null}
            </>
          ) : null}
          {deal.meeting_location ? <Row label="Meeting point" value={deal.meeting_location} /> : null}
          {deal.lend ? (
            <Row label="Borrowing period" value={`${deal.lend.start_date} → ${deal.lend.end_date}`} />
          ) : null}
          <Text style={styles.simNote}>Payments are simulated during the pilot.</Text>
        </View>

        <ErrorText>{error}</ErrorText>

        {/* pay */}
        {deal.status === 'pending_payment' && deal.i_pay ? (
          <Button
            label={`Pay ${rupees(total)} into escrow`}
            loading={busy === 'pay'}
            onPress={confirmPay}
          />
        ) : null}

        {/* handoff / return */}
        {deal.stage ? (
          <View style={styles.card}>
            <Text style={styles.label}>
              {deal.stage === 'handoff' ? 'HANDOFF AT THE MEETUP' : 'RETURN AT THE MEETUP'}
            </Text>

            <ConditionPhotos
              dealId={deal.id}
              stage={deal.stage}
              photos={deal.photos}
              canAdd
              onAdded={load}
              onError={setError}
            />

            {(deal.i_show_qr || deal.i_scan_qr) && deal.photo_status ? (
              <View style={styles.photoChecks}>
                <PhotoCheck done={deal.photo_status.mine} label="Your photo of the item" />
                <PhotoCheck done={deal.photo_status.theirs} label={`${counterparty}'s photo`} />
              </View>
            ) : null}

            {deal.i_show_qr && !deal.photo_status?.mine ? (
              <Text style={styles.hint}>
                Add a photo of the item above first. Your QR unlocks once its condition is on record.
              </Text>
            ) : null}

            {deal.i_show_qr ? (
              qr && secondsLeft > 0 ? (
                <View style={styles.qrBox}>
                  <QRCode value={qr.payload} size={190} />
                  <Text style={styles.code}>{qr.code}</Text>
                  <Text style={styles.meta}>
                    Single use · expires in {Math.floor(secondsLeft / 60)}:
                    {String(secondsLeft % 60).padStart(2, '0')}
                  </Text>
                  <Button label="New code" variant="ghost" size="sm" onPress={showQr} loading={busy === 'qr'} />
                </View>
              ) : (
                <Button
                  label={deal.stage === 'handoff' ? 'Show handoff QR' : 'Show return QR'}
                  loading={busy === 'qr'}
                  disabled={!deal.photo_status?.mine}
                  onPress={showQr}
                />
              )
            ) : null}

            {deal.i_scan_qr ? (
              <>
                {!deal.photo_status?.mine ? (
                  <Text style={styles.hint}>
                    Check the item, then add your own photo of it above. Scanning unlocks after that.
                  </Text>
                ) : null}
                <Button
                  label={deal.stage === 'handoff' ? 'Scan QR to confirm handoff' : 'Scan QR to confirm return'}
                  disabled={!deal.photo_status?.mine}
                  onPress={() => router.push({ pathname: '/scan/[id]', params: { id: deal.id } })}
                />
              </>
            ) : null}
          </View>
        ) : null}

        {/* dispute */}
        {deal.dispute ? (
          <View style={[styles.card, disputed && styles.disputeCard]}>
            <Text style={styles.label}>DISPUTE</Text>
            <Row
              label="Status"
              value={
                deal.dispute.status === 'open'
                  ? 'Waiting for admin'
                  : deal.dispute.status === 'under_review'
                    ? 'Under review'
                    : 'Resolved'
              }
            />
            <Text style={styles.body}>“{deal.dispute.reason}”</Text>
            {deal.dispute.admin_note ? (
              <Banner icon="chatbox-ellipses-outline" tone="warning" title="Admin asks" message={deal.dispute.admin_note} />
            ) : null}
            {deal.dispute.resolution ? (
              <Banner
                icon="checkmark-done-outline"
                tone="info"
                title={
                  deal.dispute.outcome === 'release'
                    ? 'Decided: the deal stands'
                    : `Decided: refunded to ${deal.i_pay ? 'you' : payerName}`
                }
                message={deal.dispute.resolution}
              />
            ) : null}
            {disputed ? (
              <>
                <ConditionPhotos dealId={deal.id} stage="handoff" photos={deal.photos} canAdd onAdded={load} onError={setError} />
                {lend ? (
                  <ConditionPhotos dealId={deal.id} stage="return" photos={deal.photos} canAdd onAdded={load} onError={setError} />
                ) : null}
              </>
            ) : null}
          </View>
        ) : null}

        {/* photo history once the deal is done */}
        {!deal.stage && !disputed && deal.photos.length ? (
          <View style={styles.card}>
            <ConditionPhotos dealId={deal.id} stage="handoff" photos={deal.photos} canAdd={false} onAdded={load} onError={setError} />
            {lend ? (
              <ConditionPhotos dealId={deal.id} stage="return" photos={deal.photos} canAdd={false} onAdded={load} onError={setError} />
            ) : null}
          </View>
        ) : null}

        {/* report a problem */}
        {disputable ? (
          reporting ? (
            <View style={styles.card}>
              <Text style={styles.label}>REPORT A PROBLEM</Text>
              <TextInput
                value={reason}
                onChangeText={setReason}
                placeholder="What went wrong? e.g. screen cracked, not as described, not returned"
                placeholderTextColor={colors.textFaint}
                style={styles.input}
                multiline
                maxLength={1000}
              />
              <Text style={styles.hint}>
                Escrow is frozen until an admin decides. Condition photos are the main evidence.
              </Text>
              <View style={styles.rowButtons}>
                <Button label="Back" variant="outline" size="sm" onPress={() => setReporting(false)} style={styles.flex} />
                <Button label="Submit" size="sm" loading={busy === 'dispute'} onPress={submitDispute} style={styles.flex} />
              </View>
            </View>
          ) : (
            <Button label="Report a problem" variant="ghost" onPress={() => setReporting(true)} />
          )
        ) : null}

        {cancellable ? (
          <Button label="Cancel deal" variant="outline" loading={busy === 'cancel'} onPress={confirmCancel} />
        ) : null}

        {deal.chat_id ? (
          <Button
            label="Open chat"
            variant="ghost"
            onPress={() =>
              router.push({ pathname: '/chat/[id]', params: { id: deal.chat_id!, listingId: deal.listing_id } })
            }
          />
        ) : null}
      </KeyboardAwareScrollView>
    </Screen>
  );
}

/** A tick or an empty circle: has this side photographed the item yet? */
function PhotoCheck({ done, label }: { done: boolean; label: string }) {
  return (
    <View style={styles.photoCheck}>
      <Ionicons
        name={done ? 'checkmark-circle' : 'ellipse-outline'}
        size={16}
        color={done ? colors.success : colors.textFaint}
      />
      <Text style={[styles.photoCheckText, done && styles.photoCheckDone]}>{label}</Text>
    </View>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, strong && styles.rowStrong]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  photoChecks: { gap: 4 },
  photoCheck: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  photoCheckText: { fontSize: 12, fontFamily: fonts.regular, color: colors.textMuted },
  photoCheckDone: { color: colors.text, fontFamily: fonts.semibold },
  safe: { flex: 1, backgroundColor: colors.background },
  flex: { flex: 1 },
  loader: { marginTop: 64 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingTop: 4, paddingBottom: 10 },
  headerTitle: { fontSize: 19, fontFamily: fonts.displayBold, color: colors.text, letterSpacing: -0.2 },
  content: { padding: 16, paddingBottom: 48, gap: 12 },
  card: {
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.card,
    padding: 14,
    gap: 10, ...shadow.card,
  },
  disputeCard: { borderColor: colors.error },
  itemRow: { flexDirection: 'row', gap: 12 },
  thumb: { width: 64, height: 64, borderRadius: 12, backgroundColor: colors.surfaceSunk },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  itemBody: { flex: 1, gap: 5 },
  itemTitle: { fontSize: 16, fontFamily: fonts.bold, color: colors.text },
  meta: { fontSize: 12, fontFamily: fonts.regular, color: colors.textMuted },
  steps: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 4 },
  step: { alignItems: 'center', gap: 4, flex: 1 },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  stepText: { fontSize: 10, color: colors.textFaint, fontFamily: fonts.semibold },
  stepTextOn: { color: colors.primary },
  next: { fontSize: 13, fontFamily: fonts.regular, color: colors.text, lineHeight: 19 },
  label: { ...typography.label, color: colors.textMuted },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  rowLabel: { fontSize: 13, fontFamily: fonts.regular, color: colors.textMuted },
  rowValue: { fontSize: 14, color: colors.text, fontFamily: fonts.semibold, flexShrink: 1, textAlign: 'right' },
  rowStrong: { fontFamily: fonts.extrabold },
  simNote: { fontSize: 11, fontFamily: fonts.regular, color: colors.textFaint, fontStyle: 'italic' },
  qrBox: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderRadius: radius.card,
  },
  code: { fontSize: 24, fontFamily: fonts.displayBold, letterSpacing: 4, color: colors.text },
  hint: { fontSize: 12, fontFamily: fonts.regular, color: colors.textMuted },
  body: { fontSize: 14, fontFamily: fonts.regular, color: colors.text, lineHeight: 20 },
  input: {
    minHeight: 90,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    padding: 12,
    fontSize: 14, fontFamily: fonts.regular,
    color: colors.text,
    textAlignVertical: 'top',
    backgroundColor: colors.background,
  },
  rowButtons: { flexDirection: 'row', gap: 10 },
});
