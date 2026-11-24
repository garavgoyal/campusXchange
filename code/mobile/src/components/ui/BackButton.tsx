import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StyleSheet } from 'react-native';
import { colors, shadow } from '../../constants/colors';
import { PressScale } from './motion';

/** Round glass back button used in every screen header. */
export function BackButton({ onPress }: { onPress?: () => void }) {
  return (
    <PressScale
      onPress={onPress ?? (() => router.back())}
      hitSlop={10}
      style={styles.btn}
      accessibilityRole="button"
      accessibilityLabel="Back"
    >
      <Ionicons name="chevron-back" size={22} color={colors.text} />
    </PressScale>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.glassStrong,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    ...shadow.card,
  },
});
