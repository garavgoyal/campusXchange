import React, { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { colors, radius, fonts, shadow } from '../../constants/colors';
import { fromIsoDay, prettyDay, toIsoDay } from '../../utils/dates';

type Props = {
  label: string;
  /** YYYY-MM-DD */
  value: string;
  onChange: (value: string) => void;
  /** YYYY-MM-DD — earlier days can't be picked. */
  minimumDate?: string;
};

/**
 * A date you tap to pick from a calendar: the system date dialog on Android,
 * an inline calendar sheet on iPhone. (The web build uses DateField.web.tsx.)
 */
export function DateField({ label, value, onChange, minimumDate }: Props) {
  const [iosOpen, setIosOpen] = useState(false);
  const [draft, setDraft] = useState<Date>(fromIsoDay(value) ?? new Date());
  const min = minimumDate ? (fromIsoDay(minimumDate) ?? undefined) : undefined;

  function open() {
    const current = fromIsoDay(value) ?? new Date();
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
        mode: 'date',
        minimumDate: min,
        onChange: (event, picked) => {
          if (event.type === 'set' && picked) onChange(toIsoDay(picked));
        },
      });
      return;
    }
    setDraft(current);
    setIosOpen(true);
  }

  return (
    <View style={styles.flex}>
      <Text style={styles.label}>{label}</Text>
      <Pressable onPress={open} style={styles.field} accessibilityRole="button" accessibilityLabel={`${label}: ${prettyDay(value)}`}>
        <Ionicons name="calendar-outline" size={14} color={colors.primary} />
        <Text style={styles.value} numberOfLines={1}>
          {prettyDay(value)}
        </Text>
      </Pressable>

      {Platform.OS === 'ios' ? (
        <Modal visible={iosOpen} transparent animationType="fade" onRequestClose={() => setIosOpen(false)}>
          <Pressable style={styles.backdrop} onPress={() => setIosOpen(false)}>
            <Pressable style={styles.sheet} onPress={() => undefined}>
              <Text style={styles.sheetTitle}>{label}</Text>
              <DateTimePicker
                value={draft}
                mode="date"
                display="inline"
                minimumDate={min}
                onChange={(_, picked) => picked && setDraft(picked)}
                accentColor={colors.primary}
              />
              <Pressable
                style={styles.done}
                onPress={() => {
                  onChange(toIsoDay(draft));
                  setIosOpen(false);
                }}
              >
                <Text style={styles.doneText}>Done</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

export const dateFieldStyles = StyleSheet.create({
  label: { fontSize: 10, fontFamily: fonts.regular, color: colors.textMuted, marginBottom: 4 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 10,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  value: { fontSize: 13, fontFamily: fonts.semibold, color: colors.text, flexShrink: 1 },
});

const styles = StyleSheet.create({
  ...dateFieldStyles,
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', padding: 20 },
  sheet: { backgroundColor: colors.glass, borderRadius: radius.card, padding: 16, gap: 8, ...shadow.card },
  sheetTitle: { fontSize: 15, fontFamily: fonts.extrabold, color: colors.text },
  done: { alignSelf: 'flex-end', paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.chip, backgroundColor: colors.primary },
  doneText: { color: colors.onBrand, fontFamily: fonts.bold },
});
