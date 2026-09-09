import React from 'react';
import { ActivityIndicator, Pressable, PressableProps, StyleSheet, Text } from 'react-native';
import { colors, radius } from '../../constants/colors';

type Variant = 'primary' | 'secondary' | 'outline' | 'ghost';

type Props = Omit<PressableProps, 'children'> & {
  label: string;
  loading?: boolean;
  variant?: Variant;
  size?: 'md' | 'sm';
};

/** primary = emerald (confirm) · secondary = amber (negotiate) · outline / ghost = quiet */
export function Button({
  label,
  loading = false,
  variant = 'primary',
  size = 'md',
  disabled,
  style,
  ...rest
}: Props) {
  const isDisabled = disabled || loading;
  const spinner =
    variant === 'primary' || variant === 'secondary' ? colors.onBrand : colors.primary;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        size === 'sm' && styles.sm,
        styles[variant],
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style as object,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={spinner} size="small" />
      ) : (
        <Text style={[styles.label, size === 'sm' && styles.labelSm, labelStyles[variant]]}>
          {label}
        </Text>
      )}
    </Pressable>
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
  sm: { minHeight: 42, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12 },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.accent },
  outline: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong },
  ghost: { backgroundColor: 'transparent' },
  pressed: { opacity: 0.88 },
  disabled: { opacity: 0.45 },
  label: { fontSize: 15, fontWeight: '700' },
  labelSm: { fontSize: 13 },
});

const labelStyles = StyleSheet.create({
  primary: { color: colors.onBrand },
  secondary: { color: colors.onBrand },
  outline: { color: colors.text },
  ghost: { color: colors.primary },
});
