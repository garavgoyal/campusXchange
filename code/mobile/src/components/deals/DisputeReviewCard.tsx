import React, { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../ui/Button';
import { colors, radius, typography, fonts, shadow } from '../../constants/colors';
import { fetchPenaltyTiers } from '../../features/transactions/api';
import type {
  AdminDispute,
  ConditionPhoto,
  PenaltyRecord,
  PenaltyTier,
  PenaltyTierKey,
} from '../../features/transactions/types';

type Props = {
  item: AdminDispute;
  busy: boolean;
  onAskEvidence: (note: string) => void;
  onResolve: (input: {
    outcome: 'release' | 'refund';
    resolution: string;
    penalty_tier?: PenaltyTierKey;
    penalty_party?: 'buyer' | 'seller';
  }) => void;
};

function Photos({ title, photos }: { title: string; photos: ConditionPhoto[] }) {
  return (
    <View style={styles.photoCol}>
      <Text style={styles.photoTitle}>{title}</Text>
      {photos.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoRow}>
          {photos.map((p) =>
            p.url ? <Image key={p.id} source={{ uri: p.url }} style={styles.photo} /> : null,
          )}
        </ScrollView>
      ) : (
        <Text style={styles.muted}>None uploaded</Text>
      )}
    </View>
  );
}

/** "Seller Garav · 2 earlier penalties (₹250)" — so repeat offenders stand out. */
function Record({ who, record }: { who: string; record: PenaltyRecord | null }) {
  if (!record) return null;
  const has = record.penalties > 0;
  return (
    <Text style={[styles.record, has && styles.recordWarn]}>
      {who} · {has ? `${record.penalties} earlier penalt${record.penalties === 1 ? 'y' : 'ies'} (₹${record.penalty_total})` : 'no earlier penalties'}
    </Text>
  );
}

/**
 * One dispute in the admin queue: the claim, the money held, and the
 * before/after condition photos side by side — the evidence the decision rests on.
 */
export function DisputeReviewCard({ item, busy, onAskEvidence, onResolve }: Props) {
  const deal = item.deal;
  const [note, setNote] = useState('');
  const [resolution, setResolution] = useState('');
  const [tiers, setTiers] = useState<PenaltyTier[]>([]);
  const [tier, setTier] = useState<PenaltyTierKey | null>(null);
  const [party, setParty] = useState<'buyer' | 'seller' | null>(null);

  useEffect(() => {
    fetchPenaltyTiers().then(setTiers).catch(() => setTiers([]));
  }, []);
  const chosen = tiers.find((t) => t.key === tier);
  const [localError, setLocalError] = useState<string | null>(null);

  const handoff = deal?.photos.filter((p) => p.stage === 'handoff') ?? [];
  // Usually the buyer paid; on an Exchange the listing owner may owe the top-up.
  const sellerPaid = !!deal && deal.payer_id === deal.seller_id;
  const payer = sellerPaid ? deal?.seller_name : deal?.buyer_name;
  const payee = sellerPaid ? deal?.buyer_name : deal?.seller_name;
  const ret = deal?.photos.filter((p) => p.stage === 'return') ?? [];

  function resolve(outcome: 'release' | 'refund') {
    setLocalError(null);
    if (resolution.trim().length < 5) return setLocalError('Write a short reason for the decision');
    if (tier && !party) return setLocalError('Choose who the penalty applies to');
    onResolve({
      outcome,
      resolution: resolution.trim(),
      ...(tier && party ? { penalty_tier: tier, penalty_party: party } : {}),
    });
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{deal?.listing?.title ?? 'Deal'}</Text>
      <Text style={styles.meta}>
        {deal?.type} · ₹{deal?.agreed_price} · buyer {deal?.buyer_name} · seller {deal?.seller_name}
      </Text>
      <Text style={styles.meta}>
        Raised by the {item.raised_by_role ?? 'party'} · stage: {item.transaction_status_before ?? '—'}
        {deal?.escrow ? ` · escrow ₹${deal.escrow.amount} held` : ''}
      </Text>
      <Text style={styles.reason}>“{item.reason}”</Text>
      <View style={styles.records}>
        <Record who={`Buyer ${deal?.buyer_name ?? ''}`} record={item.buyer_record} />
        <Record who={`Seller ${deal?.seller_name ?? ''}`} record={item.seller_record} />
      </View>
      {item.admin_note ? <Text style={styles.muted}>You asked: {item.admin_note}</Text> : null}

      <View style={styles.photosWrap}>
        <Photos title="At handoff" photos={handoff} />
        {deal?.type === 'lend' ? <Photos title="At return" photos={ret} /> : null}
      </View>

      <Text style={styles.label}>ASK FOR MORE EVIDENCE</Text>
      <View style={styles.inline}>
        <TextInput
          value={note}
          onChangeText={setNote}
          placeholder="e.g. Seller, please add a photo of the screen"
          placeholderTextColor={colors.textFaint}
          style={[styles.input, styles.flex]}
        />
        <Button
          label="Send"
          size="sm"
          variant="outline"
          disabled={note.trim().length < 3 || busy}
          onPress={() => {
            onAskEvidence(note.trim());
            setNote('');
          }}
        />
      </View>

      <Text style={styles.label}>DECISION</Text>
      <TextInput
        value={resolution}
        onChangeText={setResolution}
        placeholder="Reason for the decision (shown to both students)"
        placeholderTextColor={colors.textFaint}
        style={[styles.input, styles.multi]}
        multiline
      />
      <Text style={styles.label}>PENALTY (OPTIONAL)</Text>
      <View style={styles.tierRow}>
        <Pressable onPress={() => setTier(null)} style={[styles.chip, !tier && styles.chipNone]}>
          <Text style={[styles.chipText, !tier && styles.chipTextOn]}>None</Text>
        </Pressable>
        {tiers.map((t) => (
          <Pressable key={t.key} onPress={() => setTier(t.key)} style={[styles.chip, tier === t.key && styles.chipOn]}>
            <Text style={[styles.chipText, tier === t.key && styles.chipTextOn]}>
              {t.label} ₹{t.amount}
            </Text>
          </Pressable>
        ))}
      </View>
      {chosen ? <Text style={styles.muted}>For: {chosen.examples}</Text> : null}
      {tier ? (
        <View style={styles.inline}>
          <Text style={styles.meta}>Applies to</Text>
          {(['buyer', 'seller'] as const).map((p) => (
            <Pressable key={p} onPress={() => setParty(p)} style={[styles.chip, party === p && styles.chipOn]}>
              <Text style={[styles.chipText, party === p && styles.chipTextOn]}>{p}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {localError ? <Text style={styles.error}>{localError}</Text> : null}

      <View style={styles.inline}>
        <Button label={`Refund ${payer ?? 'payer'}`} variant="outline" loading={busy} onPress={() => resolve('refund')} style={styles.flex} />
        <Button label={`Release to ${payee ?? 'payee'}`} loading={busy} onPress={() => resolve('release')} style={styles.flex} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: 14,
    padding: 14,
    gap: 8, ...shadow.card,
  },
  title: { color: colors.text, fontSize: 16, fontFamily: fonts.bold },
  meta: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.regular },
  reason: { color: colors.text, fontSize: 14, fontFamily: fonts.regular, lineHeight: 20 },
  muted: { color: colors.textMuted, fontSize: 12, fontFamily: fonts.regular, fontStyle: 'italic' },
  photosWrap: { gap: 10 },
  photoCol: { gap: 6 },
  photoTitle: { fontSize: 12, fontFamily: fonts.bold, color: colors.text },
  photoRow: { gap: 8 },
  photo: { width: 110, height: 110, borderRadius: 10, backgroundColor: colors.surfaceSunk },
  label: { ...typography.label, color: colors.textMuted, marginTop: 4 },
  inline: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: {
    height: 40,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    paddingHorizontal: 10,
    fontSize: 13, fontFamily: fonts.regular,
    color: colors.text,
    backgroundColor: colors.background,
  },
  multi: { height: 70, paddingTop: 8, textAlignVertical: 'top' },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.error, borderColor: colors.error },
  chipNone: { backgroundColor: colors.textMuted, borderColor: colors.textMuted },
  tierRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  records: { gap: 2 },
  record: { fontSize: 12, fontFamily: fonts.regular, color: colors.textMuted },
  recordWarn: { color: colors.error, fontFamily: fonts.bold },
  chipText: { fontSize: 12, color: colors.textMuted, fontFamily: fonts.semibold, textTransform: 'capitalize' },
  chipTextOn: { color: '#fff' },
  error: { color: colors.error, fontSize: 12, fontFamily: fonts.regular },
});
