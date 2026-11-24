import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, fonts } from '../../constants/colors';

type Tone = 'info' | 'warning' | 'neutral';

type Props = {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
  tone?: Tone;
};

const TONES: Record<Tone, { bg: string; fg: string; bubble: string }> = {
  info: { bg: 'rgba(229,236,226,0.75)', fg: colors.primary, bubble: colors.glassStrong },
  warning: { bg: 'rgba(248,238,217,0.85)', fg: colors.warning, bubble: colors.glassStrong },
  neutral: { bg: colors.glass, fg: colors.textMuted, bubble: colors.surfaceSunk },
};

export function Banner({ icon = 'shield-checkmark', title, message, tone = 'info' }: Props) {
  const t = TONES[tone];
  return (
    <View style={[styles.wrap, { backgroundColor: t.bg }]}>
      <View style={[styles.icon, { backgroundColor: t.bubble }]}>
        <Ionicons name={icon} size={16} color={t.fg} />
      </View>
      <View style={styles.body}>
        <Text style={[styles.title, { color: t.fg }]}>{title}</Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderRadius: radius.card,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  icon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 2 },
  title: { fontSize: 13, fontFamily: fonts.bold },
  message: { fontSize: 12, fontFamily: fonts.regular, color: colors.textMuted, lineHeight: 17 },
});
