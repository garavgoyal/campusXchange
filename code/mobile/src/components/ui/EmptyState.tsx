import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../../constants/colors';

type Props = {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
};

export function EmptyState({ icon = 'cube-outline', title, message }: Props) {
  return (
    <View style={styles.wrapper}>
      <Ionicons name={icon} size={36} color={colors.textMuted} />
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', gap: 8, paddingVertical: 56, paddingHorizontal: 32 },
  title: { color: colors.text, fontSize: 16, fontWeight: '600' },
  message: { color: colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
