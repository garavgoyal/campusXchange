import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView, type SafeAreaViewProps } from 'react-native-safe-area-context';
import { colors } from '../../constants/colors';

/**
 * Soft sage and tomato glows behind the off-white page. Glass surfaces need
 * something behind them to read as glass; these do it without an image.
 */
export function Backdrop() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={['#E9EFE4', colors.background, colors.background]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(85,116,89,0.22)', 'rgba(85,116,89,0)']}
        start={{ x: 0.5, y: 0.5 }}
        end={{ x: 1, y: 1 }}
        style={[styles.blob, styles.sage]}
      />
      <LinearGradient
        colors={['rgba(212,74,50,0.12)', 'rgba(212,74,50,0)']}
        start={{ x: 0.5, y: 0.5 }}
        end={{ x: 0, y: 0 }}
        style={[styles.blob, styles.tomato]}
      />
    </View>
  );
}

/** A screen root: the safe area over the backdrop. Same props as SafeAreaView. */
export function Screen({ children, style, ...rest }: SafeAreaViewProps) {
  return (
    <SafeAreaView style={[styles.root, style]} {...rest}>
      <Backdrop />
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  blob: { position: 'absolute', width: 360, height: 360, borderRadius: 180 },
  sage: { top: -150, left: -120 },
  tomato: { bottom: -170, right: -150 },
});
