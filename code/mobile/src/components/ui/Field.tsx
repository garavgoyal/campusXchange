import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { colors, radius, typography } from '../../constants/colors';

type Props = TextInputProps & {
  /** Small uppercase label above the field. */
  label?: string;
  /** Right-aligned hint beside the label, e.g. "@thapar.edu". */
  hint?: string;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  /** Shows a green tick inside the field once the value is valid. */
  valid?: boolean;
};

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
        {leftIcon ? (
          <Ionicons name={leftIcon} size={17} color={colors.textFaint} />
        ) : null}
        <TextInput
          placeholderTextColor={colors.textFaint}
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
  hintText: { fontSize: 11, fontWeight: '700', color: colors.primary },
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
  input: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 14 },
});
