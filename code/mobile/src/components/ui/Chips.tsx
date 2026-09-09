import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../../constants/colors';

type Props = {
  options: readonly string[];
  value: string | null;
  onChange: (value: string | null) => void;
  /** Label for the "no selection" chip. Omit to hide it. */
  allLabel?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Lay out as a wrapping grid instead of a horizontal scroller. */
  wrap?: boolean;
};

export function Chips({ options, value, onChange, allLabel, icon, wrap }: Props) {
  const items: (string | null)[] = allLabel ? [null, ...options] : [...options];

  const chips = items.map((item) => {
    const active = item === value;
    return (
      <Pressable
        key={item ?? '__all__'}
        onPress={() => onChange(item)}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        style={[styles.chip, active && styles.chipActive]}
      >
        {icon ? (
          <Ionicons
            name={icon}
            size={13}
            color={active ? colors.primary : colors.textFaint}
          />
        ) : null}
        <Text style={[styles.label, active && styles.labelActive]}>{item ?? allLabel}</Text>
      </Pressable>
    );
  });

  if (wrap) return <View style={styles.wrapRow}>{chips}</View>;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {chips}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingRight: 16 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: radius.chip,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primaryTint, borderColor: colors.primary },
  label: { fontSize: 13, fontWeight: '600', color: colors.textMuted },
  labelActive: { color: colors.primary },
});
