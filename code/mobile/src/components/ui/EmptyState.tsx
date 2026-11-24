import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../../constants/colors';

type Props = {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  message?: string;
};

/** Empty list: an icon bubble, a title and a hint. */
export function EmptyState({ icon = 'cube-outline', title, message }: Props) {
  return (
    <View style={styles.wrapper}>
      <View style={styles.bubble}>
        <Ionicons name={icon} size={30} color={colors.primary} />
      </View>
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: 'center', gap: 8, paddingVertical: 48, paddingHorizontal: 32 },
  bubble: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glassStrong,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    marginBottom: 6,
  },
  title: { color: colors.text, fontSize: 17, fontFamily: fonts.display },
  message: { color: colors.textMuted, fontSize: 14, fontFamily: fonts.regular, textAlign: 'center', lineHeight: 20 },
});
