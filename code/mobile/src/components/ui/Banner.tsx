import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../../constants/colors';

type Tone = 'info' | 'warning' | 'neutral';

type Props = {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  tone?: Tone;
};

const TONES: Record<Tone, { bg: string; fg: string }> = {
  info: { bg: colors.primaryTint, fg: colors.primary },
  warning: { bg: colors.warningTint, fg: colors.warning },
  neutral: { bg: colors.surfaceSunk, fg: colors.textMuted },
};

export function Banner({ icon = 'shield-checkmark', title, message, tone = 'info' }: Props) {
  const t = TONES[tone];
  return (
    <View style={[styles.wrap, { backgroundColor: t.bg }]}>
      <Ionicons name={icon} size={17} color={t.fg} style={styles.icon} />
      <View style={styles.body}>
        <Text style={[styles.title, { color: t.fg }]}>{title}</Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: 10, borderRadius: radius.card, padding: 13 },
  icon: { marginTop: 1 },
  body: { flex: 1, gap: 2 },
  title: { fontSize: 13, fontWeight: '700' },
  message: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
});
