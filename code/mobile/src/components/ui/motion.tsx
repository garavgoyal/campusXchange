import React from 'react';
import { Pressable, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type PressScaleProps = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
  /** How far it shrinks while held (0.98 = 2%). */
  scaleTo?: number;
};

/** A Pressable that shrinks very slightly while held, so a tap feels answered. */
export function PressScale({ scaleTo = 0.98, onPressIn, onPressOut, style, disabled, ...rest }: PressScaleProps) {
  const scale = useSharedValue(1);
  // An animated component takes a plain style, not Pressable's style function,
  // so the pressed state is tracked here and passed to `style` ourselves.
  const [pressed, setPressed] = React.useState(false);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable
      disabled={disabled}
      onPressIn={(e) => {
        if (!disabled) scale.value = withTiming(scaleTo, { duration: 80, reduceMotion: ReduceMotion.System });
        setPressed(true);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        scale.value = withTiming(1, { duration: 120, reduceMotion: ReduceMotion.System });
        setPressed(false);
        onPressOut?.(e);
      }}
      style={[typeof style === 'function' ? style({ pressed }) : style, animated]}
      {...rest}
    />
  );
}

/**
 * A plain wrapper for cards and list rows. Rows used to slide in one after
 * another; that was too much movement (and lists re-ran it while scrolling),
 * so they now simply appear. `index` is kept so callers need no change.
 */
export function Appear({
  style,
  children,
}: {
  index?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  return <View style={style}>{children}</View>;
}

/** A small solid dot for "live" labels. */
export function PulseDot({ color, size = 8 }: { color: string; size?: number }) {
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }} />;
}
