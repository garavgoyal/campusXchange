import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, fonts } from '../../constants/colors';

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  minimumDate?: string;
};

/** Web build only (the native calendar picker has no web version): type YYYY-MM-DD. */
export function DateField({ label, value, onChange }: Props) {
  return (
    <View style={styles.flex}>
      <Text style={styles.label}>{label}</Text>
      <TextInput value={value} onChangeText={onChange} maxLength={10} placeholder="YYYY-MM-DD" style={styles.field} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  label: { fontSize: 10, fontFamily: fonts.regular, color: colors.textMuted, marginBottom: 4 },
  field: {
    height: 40,
    paddingHorizontal: 10,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    fontSize: 13, fontFamily: fonts.regular,
    color: colors.text,
  },
});
