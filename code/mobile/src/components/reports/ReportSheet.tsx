import React, { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, typography, fonts } from '../../constants/colors';
import { createReport } from '../../features/reports/api';
import { REPORT_REASONS, type ReportReason, type ReportTarget } from '../../features/reports/types';
import { Button } from '../ui/Button';
import { ErrorText } from '../ui/ErrorText';

type Props = {
  visible: boolean;
  target: ReportTarget | null;
  /** "this listing" / "this student" — used in the heading. */
  what: string;
  onClose: () => void;
};

/**
 * Bottom sheet to report a listing or a person to the admins. One tap on a
 * reason, optional details, Send. The admins review it in their Reports queue.
 */
export function ReportSheet({ visible, target, what, onClose }: Props) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (visible) {
      setReason(null);
      setDetails('');
      setError(null);
      setSent(false);
    }
  }, [visible]);

  async function send() {
    if (!target || !reason) return;
    setSending(true);
    setError(null);
    try {
      await createReport(target, reason, details);
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the report');
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.sheetWrap}>
        <View style={styles.sheet}>
          {sent ? (
            <View style={styles.done}>
              <Ionicons name="checkmark-circle" size={40} color={colors.success} />
              <Text style={styles.title}>Report sent</Text>
              <Text style={styles.muted}>
                An admin will look at it. You'll get a notification when they decide.
              </Text>
              <Button label="Done" onPress={onClose} />
            </View>
          ) : (
            <>
              <Text style={styles.title}>Report {what}</Text>
              <Text style={styles.muted}>Only admins see reports. The other person is not told who reported.</Text>

              <Text style={styles.label}>WHAT'S WRONG?</Text>
              <View style={styles.reasons}>
                {REPORT_REASONS.map((r) => (
                  <Pressable
                    key={r.key}
                    onPress={() => setReason(r.key)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: reason === r.key }}
                    style={[styles.chip, reason === r.key && styles.chipOn]}
                  >
                    <Text style={[styles.chipText, reason === r.key && styles.chipTextOn]}>{r.label}</Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>DETAILS (OPTIONAL)</Text>
              <TextInput
                value={details}
                onChangeText={setDetails}
                placeholder="What happened? e.g. asked me to pay outside the app"
                placeholderTextColor={colors.textFaint}
                multiline
                maxLength={1000}
                style={styles.input}
              />

              <ErrorText>{error}</ErrorText>
              <View style={styles.row}>
                <View style={styles.flex}>
                  <Button label="Cancel" variant="outline" onPress={onClose} />
                </View>
                <View style={styles.flex}>
                  <Button label="Send report" disabled={!reason} loading={sending} onPress={send} />
                </View>
              </View>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheetWrap: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    padding: 18,
    paddingBottom: 30,
    gap: 10,
  },
  done: { alignItems: 'center', gap: 10, paddingVertical: 8 },
  title: { fontSize: 18, fontFamily: fonts.extrabold, color: colors.text },
  muted: { fontSize: 13, fontFamily: fonts.regular, color: colors.textMuted, lineHeight: 18 },
  label: { ...typography.label, color: colors.textMuted, marginTop: 4 },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.chip,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.error, borderColor: colors.error },
  chipText: { fontSize: 13, fontFamily: fonts.semibold, color: colors.text },
  chipTextOn: { color: colors.onBrand },
  input: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    padding: 10,
    fontSize: 14, fontFamily: fonts.regular,
    color: colors.text,
    textAlignVertical: 'top',
  },
  row: { flexDirection: 'row', gap: 10, marginTop: 4 },
  flex: { flex: 1 },
});
