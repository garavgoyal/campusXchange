import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { colors, fonts } from '../../constants/colors';

export function ScreenTitle({ children }: { children: string }) {
  return <Text style={styles.title}>{children}</Text>;
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: 26,
    letterSpacing: -0.4,
    fontFamily: fonts.displayBold,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
});
