import React, { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../ui/Button';
import { colors, radius, typography } from '../../constants/colors';
import type { AdminDispute, ConditionPhoto } from '../../features/transactions/types';

type Props = {
  item: AdminDispute;
  busy: boolean;
  onAskEvidence: (note: string) => void;
  onResolve: (input: {
    outcome: 'release' | 'refund';
    resolution: string;
    penalty_amount?: number;
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

/**
 * One dispute in the admin queue: the claim, the money held, and the
 * before/after condition photos side by side — the evidence the decision rests on.
 */
export function DisputeReviewCard({ item, busy, onAskEvidence, onResolve }: Props) {
  const deal = item.deal;
  const [note, setNote] = useState('');
  const [resolution, setResolution] = useState('');
  const [penalty, setPenalty] = useState('');
  const [party, setParty] = useState<'buyer' | 'seller' | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const handoff = deal?.photos.filter((p) => p.stage === 'handoff') ?? [];
  const ret = deal?.photos.filter((p) => p.stage === 'return') ?? [];

  function resolve(outcome: 'release' | 'refund') {
    setLocalError(null);
    if (resolution.trim().length < 5) return setLocalError('Write a short reason for the decision');
    const amount = penalty ? Number(penalty) : 0;
    if (amount > 0 && !party) return setLocalError('Choose who the penalty applies to');
    onResolve({
      outcome,
      resolution: resolution.trim(),
      ...(amount > 0 && party ? { penalty_amount: amount, penalty_party: party } : {}),
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
      <View style={styles.inline}>
        <TextInput
          value={penalty}
          onChangeText={(t) => setPenalty(t.replace(/[^0-9]/g, ''))}
          placeholder="Penalty ₹ (optional)"
          placeholderTextColor={colors.textFaint}
          keyboardType="number-pad"
          style={[styles.input, styles.flex]}
        />
        {(['buyer', 'seller'] as const).map((p) => (
          <Pressable key={p} onPress={() => setParty(party === p ? null : p)} style={[styles.chip, party === p && styles.chipOn]}>
            <Text style={[styles.chipText, party === p && styles.chipTextOn]}>{p}</Text>
          </Pressable>
        ))}
      </View>

      {localError ? <Text style={styles.error}>{localError}</Text> : null}

      <View style={styles.inline}>
        <Button label="Refund buyer" variant="outline" loading={busy} onPress={() => resolve('refund')} style={styles.flex} />
        <Button label="Release to seller" loading={busy} onPress={() => resolve('release')} style={styles.flex} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  meta: { color: colors.textMuted, fontSize: 12 },
  reason: { color: colors.text, fontSize: 14, lineHeight: 20 },
  muted: { color: colors.textMuted, fontSize: 12, fontStyle: 'italic' },
  photosWrap: { gap: 10 },
  photoCol: { gap: 6 },
  photoTitle: { fontSize: 12, fontWeight: '700', color: colors.text },
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
    fontSize: 13,
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
  chipText: { fontSize: 12, color: colors.textMuted, fontWeight: '600', textTransform: 'capitalize' },
  chipTextOn: { color: '#fff' },
  error: { color: colors.error, fontSize: 12 },
});
