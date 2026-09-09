import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { colors } from '../../constants/colors';

export function ErrorText({ children }: { children?: string | null }) {
  if (!children) return null;
  return <Text style={styles.error}>{children}</Text>;
}

const styles = StyleSheet.create({
  error: { color: colors.error, fontSize: 14, marginBottom: 12 },
});
