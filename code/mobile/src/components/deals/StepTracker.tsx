import React, { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { colors, fonts } from '../../constants/colors';

const DOT = 24;

/**
 * Deal progress: done steps are sage with a tick, the next step is marked in
 * tomato, and the sage line slides up to where the deal has got to.
 */
export function StepTracker({ steps, reached }: { steps: string[]; reached: number }) {
  const [width, setWidth] = useState(0);
  const gap = steps.length > 1 ? (width - DOT) / (steps.length - 1) : 0;
  const fill = useSharedValue(0);

  useEffect(() => {
    fill.value = withTiming(Math.max(0, reached) * gap, { duration: 250, reduceMotion: ReduceMotion.System });
  }, [reached, gap, fill]);

  const line = useAnimatedStyle(() => ({ width: fill.value }));
  const next = reached + 1 < steps.length ? reached + 1 : -1;

  return (
    <View style={styles.wrap}>
      <View style={styles.track} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        <View style={styles.rail} />
        <Animated.View style={[styles.railOn, line]} />
        {steps.map((label, i) => (
          <View key={label} style={[styles.dotSlot, { left: i * gap }]}>
            <Dot done={i <= reached} next={i === next} />
          </View>
        ))}
      </View>
      <View style={styles.labels}>
        {steps.map((label, i) => (
          <Text
            key={label}
            style={[
              styles.label,
              i <= reached && styles.labelDone,
              i === next && styles.labelNext,
              i === 0 && styles.left,
              i === steps.length - 1 && styles.right,
            ]}
            numberOfLines={1}
          >
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
}

function Dot({ done, next }: { done: boolean; next: boolean }) {
  return (
    <View style={[styles.dot, done && styles.dotDone, next && styles.dotNext]}>
      {done ? <Ionicons name="checkmark" size={13} color={colors.onBrand} /> : null}
      {next ? <View style={styles.nextCore} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, paddingTop: 4 },
  track: { height: DOT, justifyContent: 'center' },
  rail: {
    position: 'absolute',
    left: DOT / 2,
    right: DOT / 2,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.border,
  },
  railOn: { position: 'absolute', left: DOT / 2, height: 3, borderRadius: 2, backgroundColor: colors.primary },
  dotSlot: { position: 'absolute', width: DOT, height: DOT, alignItems: 'center', justifyContent: 'center' },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  dotNext: { borderColor: colors.accent },
  nextCore: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  labels: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { flex: 1, textAlign: 'center', fontSize: 10, fontFamily: fonts.semibold, color: colors.textFaint },
  labelDone: { color: colors.primary },
  labelNext: { color: colors.accent, fontFamily: fonts.bold },
  left: { textAlign: 'left' },
  right: { textAlign: 'right' },
});
