import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { PressScale } from './motion';
import { colors, radius, fonts } from '../../constants/colors';

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
      <PressScale
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
            color={active ? colors.onBrand : colors.textFaint}
          />
        ) : null}
        <Text style={[styles.label, active && styles.labelActive]}>{item ?? allLabel}</Text>
      </PressScale>
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
  row: { gap: 8, paddingRight: 16, paddingVertical: 2 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: radius.chip,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  label: { fontSize: 13, fontFamily: fonts.semibold, color: colors.textMuted },
  labelActive: { color: colors.onBrand },
});
