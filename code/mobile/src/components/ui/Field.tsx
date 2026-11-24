import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { colors, radius, typography, fonts } from '../../constants/colors';

type Props = TextInputProps & {
  /** Small uppercase label above the field. */
  label?: string;
  /** Right-aligned hint beside the label, e.g. "@thapar.edu". */
  hint?: string;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  /** Shows a green tick inside the field once the value is valid. */
  valid?: boolean;
};

/**
 * A labelled text box. It deliberately keeps no "focused" state: restyling the
 * box when it gains focus made Android move focus to the next box, round and
 * round, so nobody could type. The sage cursor shows which box is active.
 */
export function Field({ label, hint, leftIcon, valid, style, ...rest }: Props) {
  return (
    <View style={styles.wrap}>
      {(label || hint) && (
        <View style={styles.labelRow}>
          {label ? <Text style={styles.label}>{label}</Text> : <View />}
          {hint ? (
            <View style={styles.hintPill}>
              <Text style={styles.hintText}>{hint}</Text>
            </View>
          ) : null}
        </View>
      )}

      <View style={styles.field}>
        {leftIcon ? <Ionicons name={leftIcon} size={17} color={colors.textFaint} /> : null}
        <TextInput
          placeholderTextColor={colors.textFaint}
          cursorColor={colors.primary}
          selectionColor={colors.primarySoft}
          style={[styles.input, style]}
          {...rest}
        />
        {valid ? (
          <Ionicons name="checkmark-circle" size={19} color={colors.success} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { ...typography.label, color: colors.textMuted, textTransform: 'uppercase' },
  hintPill: {
    backgroundColor: colors.primaryTint,
    borderRadius: radius.chip,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  hintText: { fontSize: 11, fontFamily: fonts.bold, color: colors.primary },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  input: { flex: 1, fontSize: 15, fontFamily: fonts.regular, color: colors.text, paddingVertical: 14 },
});
