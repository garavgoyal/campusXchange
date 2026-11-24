import React from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import { colors, radius, shadow } from '../../constants/colors';

type Props = ViewProps & {
  /** Blur strength (iOS and web). Android shows a frosted tint instead, which is much cheaper. */
  intensity?: number;
  /** Rounded card with a hairline border and soft shadow. Off for bars that touch the screen edge. */
  card?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Light glass: real blur on iOS and the web, a translucent frosted tint on
 * Android (blur there is slow on budget phones, NFR-POR-2). Use it for bars,
 * sheets and floating controls; plain cards use GlassCard.
 */
export function GlassView({ intensity = 40, card = false, style, children, ...rest }: Props) {
  const flat = StyleSheet.flatten(style) ?? {};
  const r = flat.borderRadius ?? (card ? radius.card : 0);
  return (
    <View style={[card && styles.card, card && shadow.float, style, { borderRadius: r }]} {...rest}>
      <View style={[StyleSheet.absoluteFill, { borderRadius: r, overflow: 'hidden' }]} pointerEvents="none">
        {Platform.OS === 'android' ? (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassStrong }]} />
        ) : (
          <>
            <BlurView intensity={intensity} tint="light" style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.glassTint }]} />
          </>
        )}
      </View>
      {children}
    </View>
  );
}

/** A translucent off-white card with a white hairline: the glass look without a blur. */
export function GlassCard({ style, children, ...rest }: ViewProps) {
  return (
    <View style={[styles.glassCard, shadow.card, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.glassBorder },
  glassCard: {
    backgroundColor: colors.glass,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
});
