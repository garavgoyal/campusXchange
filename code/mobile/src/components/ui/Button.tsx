import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, PressableProps, StyleSheet, Text } from 'react-native';
import { colors, radius, fonts } from '../../constants/colors';
import { PressScale } from './motion';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost';

type Props = Omit<PressableProps, 'children'> & {
  label: string;
  loading?: boolean;
  variant?: Variant;
  size?: 'md' | 'sm';
  /** Optional icon before the label. */
  icon?: keyof typeof Ionicons.glyphMap;
};

/** primary = sage (confirm) · secondary = tomato (negotiate / attention) · outline / ghost = quiet */
export function Button({
  label,
  loading = false,
  variant = 'primary',
  size = 'md',
  icon,
  disabled,
  style,
  ...rest
}: Props) {
  const isDisabled = disabled || loading;
  const filled = variant === 'primary' || variant === 'secondary';
  const fg = filled ? colors.onBrand : variant === 'ghost' ? colors.primary : colors.text;

  return (
    <PressScale
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: loading }}
      disabled={isDisabled}
      scaleTo={0.97}
      style={({ pressed }) => [
        styles.base,
        size === 'sm' && styles.sm,
        styles[variant],
        pressed && !isDisabled && pressedStyles[variant],
        isDisabled && styles.disabled,
        style as object,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={size === 'sm' ? 15 : 18} color={fg} /> : null}
          <Text style={[styles.label, size === 'sm' && styles.labelSm, { color: fg }]}>{label}</Text>
        </>
      )}
    </PressScale>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.button,
    paddingVertical: 15,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    flexDirection: 'row',
    gap: 8,
  },
  sm: { minHeight: 42, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 13 },
  primary: {
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  secondary: {
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.28,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  outline: { backgroundColor: colors.glassStrong, borderWidth: 1, borderColor: colors.borderStrong },
  ghost: { backgroundColor: 'transparent' },
  disabled: { opacity: 0.45, shadowOpacity: 0, elevation: 0 },
  label: { fontSize: 15, fontFamily: fonts.bold },
  labelSm: { fontSize: 13 },
});

const pressedStyles = StyleSheet.create({
  primary: { backgroundColor: colors.primaryPressed },
  secondary: { backgroundColor: colors.accentPressed },
  outline: { backgroundColor: colors.surfaceSunk },
  ghost: { backgroundColor: colors.primaryTint },
});
